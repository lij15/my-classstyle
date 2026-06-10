using { my.classstyle as db } from '../db/schema';

service CatalogService {

    entity Books as projection on db.Books;
    action submitOrder(bookID:UUID,amount:Integer) returns {message:String;};

}