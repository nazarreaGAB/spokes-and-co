>>SOURCE FORMAT FREE
*> ====================================================================
*> SPOKES & CO. - CHECKOUT ENGINE (COBOL BACKEND)
*>
*> Every business calculation of the shop happens in this program.
*> It is stateless: the Node API sends it the current catalogue, stock
*> and the customer's quantities; it validates, calculates and answers.
*> (Node keeps the stock in memory and updates it from our answer.)
*>
*> INPUT (stdin, one value per line)
*>   line 1 : command   STATUS | QUOTE | CHECKOUT
*>   line 2 : promo code (blank = none)
*>   line 3 : number of products, 2 digits
*>   line 4+: ONE fixed-width record per catalogue product (21 chars):
*>              col  1     sign of quantity (+ or -)
*>              col  2-7   quantity ordered           6 digits
*>              col  8-15  unit price in centavos     8 digits
*>              col 16-21  stock available            6 digits
*>
*> OUTPUT (stdout, pipe-delimited)
*>   STATUS   -> COBOL|CONNECTED
*>   failure  -> ERR|code|product position|message
*>   success  -> OK
*>               R|remaining stock|qty|unit|discount|line total   (per product)
*>               T|subtotal|promo discount|vat|shipping|total
*>   (all money is whole centavos, 12 digits)
*> ====================================================================
IDENTIFICATION DIVISION.
PROGRAM-ID. SPOKES-SHOP.

DATA DIVISION.
WORKING-STORAGE SECTION.
*> ---- business rules (change them here, nowhere else) -------------
01 WS-VAT-RATE         PIC 9V99     VALUE 0.12.
01 WS-RATE-3           PIC 9V99     VALUE 0.05.
01 WS-RATE-5           PIC 9V99     VALUE 0.10.
01 WS-MAX-QTY          PIC 9(3)     VALUE 50.
01 WS-MAX-PRODUCTS     PIC 99       VALUE 50.
01 WS-FREE-SHIP-MIN    PIC 9(8)     VALUE 500000.
01 WS-SHIP-FEE         PIC 9(8)     VALUE 25000.
01 WS-PROMO-FLAT       PIC 9(8)     VALUE 50000.

*> ---- control fields ------------------------------------------------
01 WS-OK               PIC X        VALUE "Y".
01 WS-CMD              PIC X(10).
01 WS-PROMO            PIC X(12).
01 WS-COUNT-TXT        PIC X(2).
01 WS-COUNT            PIC 99       VALUE 0.
01 WS-IN-LINE          PIC X(80).
01 WS-ERR-CODE         PIC X(3).
01 WS-ERR-POS          PIC 99       VALUE 0.
01 WS-ERR-MSG          PIC X(60).
01 WS-I                PIC 99.
01 WS-ORDERED          PIC 99       VALUE 0.
01 WS-RATE             PIC 9V99.

*> ---- one entry per catalogue product -------------------------------
01 ORDER-TABLE.
    05 ORD-ENTRY OCCURS 50 TIMES.
        10 O-QTY       PIC 9(6).
        10 O-PRICE     PIC 9(8).
        10 O-STOCK     PIC 9(6).
        10 O-REMAIN    PIC 9(6).
        10 O-GROSS     PIC 9(12).
        10 O-DISC      PIC 9(12).
        10 O-NET       PIC 9(12).

*> ---- order totals (centavos) ---------------------------------------
01 WS-SUBTOTAL         PIC 9(12).
01 WS-PROMO-DISC       PIC 9(12).
01 WS-TAXABLE          PIC 9(12).
01 WS-VAT              PIC 9(12).
01 WS-SHIPPING         PIC 9(12).
01 WS-TOTAL            PIC 9(12).

PROCEDURE DIVISION.
MAIN-PARA.
    ACCEPT WS-CMD
    EVALUATE WS-CMD
        WHEN "STATUS"
            DISPLAY "COBOL|CONNECTED"
        WHEN "QUOTE"
            PERFORM DO-ORDER
        WHEN "CHECKOUT"
            PERFORM DO-ORDER
        WHEN OTHER
            DISPLAY "ERR|E01|00|Unknown command"
    END-EVALUATE
    STOP RUN.

*> --------------------------------------------------------------------
DO-ORDER.
    MOVE "Y" TO WS-OK
    MOVE 0 TO WS-ORDERED
    ACCEPT WS-PROMO
    ACCEPT WS-COUNT-TXT

    IF WS-COUNT-TXT IS NOT NUMERIC
        MOVE "E02" TO WS-ERR-CODE
        MOVE 0 TO WS-ERR-POS
        MOVE "Invalid product count" TO WS-ERR-MSG
        MOVE "N" TO WS-OK
    ELSE
        MOVE WS-COUNT-TXT TO WS-COUNT
        IF WS-COUNT < 1 OR WS-COUNT > WS-MAX-PRODUCTS
            MOVE "E02" TO WS-ERR-CODE
            MOVE 0 TO WS-ERR-POS
            MOVE "Invalid product count" TO WS-ERR-MSG
            MOVE "N" TO WS-OK
        END-IF
    END-IF

    IF WS-OK = "Y"
        PERFORM READ-ITEMS
    END-IF
    IF WS-OK = "Y" AND WS-ORDERED = 0
        MOVE "E02" TO WS-ERR-CODE
        MOVE 0 TO WS-ERR-POS
        MOVE "Your basket is empty" TO WS-ERR-MSG
        MOVE "N" TO WS-OK
    END-IF
    IF WS-OK = "Y"
        PERFORM CHECK-PROMO
    END-IF
    IF WS-OK = "Y"
        PERFORM PRICE-ORDER
    END-IF

    IF WS-OK = "Y"
        PERFORM PRINT-RESULT
    ELSE
        DISPLAY "ERR|" WS-ERR-CODE "|" WS-ERR-POS "|"
                FUNCTION TRIM(WS-ERR-MSG)
    END-IF.

*> --------------------------------------------------------------------
*> Read one record per product and validate it:
*>   - sign must be + or -, the rest must be digits
*>   - negative quantities are rejected
*>   - at most 50 of one item
*>   - an order can never exceed the stock available (no overselling)
READ-ITEMS.
    PERFORM VARYING WS-I FROM 1 BY 1
            UNTIL WS-I > WS-COUNT OR WS-OK = "N"
        MOVE SPACES TO WS-IN-LINE
        ACCEPT WS-IN-LINE

        IF (WS-IN-LINE(1:1) NOT = "+" AND WS-IN-LINE(1:1) NOT = "-")
           OR WS-IN-LINE(2:20) IS NOT NUMERIC
            MOVE "E03" TO WS-ERR-CODE
            MOVE WS-I TO WS-ERR-POS
            MOVE "Quantity must be a whole number" TO WS-ERR-MSG
            MOVE "N" TO WS-OK
        ELSE
            MOVE WS-IN-LINE(2:6)  TO O-QTY(WS-I)
            MOVE WS-IN-LINE(8:8)  TO O-PRICE(WS-I)
            MOVE WS-IN-LINE(16:6) TO O-STOCK(WS-I)

            IF WS-IN-LINE(1:1) = "-" AND O-QTY(WS-I) > 0
                MOVE "E04" TO WS-ERR-CODE
                MOVE WS-I TO WS-ERR-POS
                MOVE "Quantities cannot be negative" TO WS-ERR-MSG
                MOVE "N" TO WS-OK
            ELSE
                IF O-QTY(WS-I) > WS-MAX-QTY
                    MOVE "E04" TO WS-ERR-CODE
                    MOVE WS-I TO WS-ERR-POS
                    MOVE "Maximum of 50 per item" TO WS-ERR-MSG
                    MOVE "N" TO WS-OK
                ELSE
                    IF O-QTY(WS-I) > O-STOCK(WS-I)
                        MOVE "E06" TO WS-ERR-CODE
                        MOVE WS-I TO WS-ERR-POS
                        MOVE "Not enough stock" TO WS-ERR-MSG
                        MOVE "N" TO WS-OK
                    ELSE
                        COMPUTE O-REMAIN(WS-I) =
                            O-STOCK(WS-I) - O-QTY(WS-I)
                        IF O-QTY(WS-I) > 0
                            ADD 1 TO WS-ORDERED
                        END-IF
                    END-IF
                END-IF
            END-IF
        END-IF
    END-PERFORM.

*> --------------------------------------------------------------------
CHECK-PROMO.
    MOVE FUNCTION UPPER-CASE(WS-PROMO) TO WS-PROMO
    IF WS-PROMO NOT = SPACES
        IF WS-PROMO NOT = "RIDE10" AND WS-PROMO NOT = "WELCOME500"
            MOVE "E08" TO WS-ERR-CODE
            MOVE 0 TO WS-ERR-POS
            MOVE "Promo code not recognised" TO WS-ERR-MSG
            MOVE "N" TO WS-OK
        END-IF
    END-IF.

*> --------------------------------------------------------------------
*> Pricing rules (all amounts in centavos):
*>   - 3 or more of the same item: 5% off that line
*>   - 5 or more of the same item: 10% off that line
*>   - RIDE10     : extra 10% off the subtotal
*>   - WELCOME500 : PHP 500 off, only if subtotal is at least PHP 5,000
*>   - VAT 12% on the discounted amount
*>   - Shipping PHP 250, free when the discounted amount >= PHP 5,000
PRICE-ORDER.
    MOVE 0 TO WS-SUBTOTAL
    PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > WS-COUNT
        COMPUTE O-GROSS(WS-I) = O-PRICE(WS-I) * O-QTY(WS-I)
        EVALUATE TRUE
            WHEN O-QTY(WS-I) >= 5
                MOVE WS-RATE-5 TO WS-RATE
            WHEN O-QTY(WS-I) >= 3
                MOVE WS-RATE-3 TO WS-RATE
            WHEN OTHER
                MOVE 0 TO WS-RATE
        END-EVALUATE
        COMPUTE O-DISC(WS-I) ROUNDED = O-GROSS(WS-I) * WS-RATE
        COMPUTE O-NET(WS-I) = O-GROSS(WS-I) - O-DISC(WS-I)
        ADD O-NET(WS-I) TO WS-SUBTOTAL
    END-PERFORM

    MOVE 0 TO WS-PROMO-DISC
    EVALUATE WS-PROMO
        WHEN "RIDE10"
            COMPUTE WS-PROMO-DISC ROUNDED = WS-SUBTOTAL * 0.10
        WHEN "WELCOME500"
            IF WS-SUBTOTAL >= WS-FREE-SHIP-MIN
                MOVE WS-PROMO-FLAT TO WS-PROMO-DISC
            ELSE
                MOVE "E09" TO WS-ERR-CODE
                MOVE 0 TO WS-ERR-POS
                MOVE "WELCOME500 needs a subtotal of at least 5,000"
                    TO WS-ERR-MSG
                MOVE "N" TO WS-OK
            END-IF
    END-EVALUATE

    IF WS-OK = "Y"
        COMPUTE WS-TAXABLE = WS-SUBTOTAL - WS-PROMO-DISC
        COMPUTE WS-VAT ROUNDED = WS-TAXABLE * WS-VAT-RATE
        IF WS-TAXABLE >= WS-FREE-SHIP-MIN
            MOVE 0 TO WS-SHIPPING
        ELSE
            MOVE WS-SHIP-FEE TO WS-SHIPPING
        END-IF
        COMPUTE WS-TOTAL = WS-TAXABLE + WS-VAT + WS-SHIPPING
    END-IF.

*> --------------------------------------------------------------------
PRINT-RESULT.
    DISPLAY "OK"
    PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > WS-COUNT
        DISPLAY "R|" O-REMAIN(WS-I) "|" O-QTY(WS-I) "|"
                O-PRICE(WS-I) "|" O-DISC(WS-I) "|" O-NET(WS-I)
    END-PERFORM
    DISPLAY "T|" WS-SUBTOTAL "|" WS-PROMO-DISC "|" WS-VAT "|"
            WS-SHIPPING "|" WS-TOTAL.
