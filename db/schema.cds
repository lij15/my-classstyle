namespace my.classstyle;

using { cuid,managed } from '@sap/cds/common';

entity Books : cuid,managed {
    title       :   String(200);
    price       :   Decimal(9,2);
    stock       :   Integer default 0;
    published   :   Boolean default false;
}