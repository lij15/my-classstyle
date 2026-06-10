using { my.classstyle as db } from '../db/schema';

service AdminService {

    entity Books as projection on db.Books;
    action resetStock(bookID:UUID,amount:Integer) returns {message:String;};

}