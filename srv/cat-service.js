const cds = require('@sap/cds')

class CatalogService extends cds.ApplicationService {
    async init(){
        const {Books} = this.entities

        this.before('CREATE',Books,req => {
            console.log('[CatalogService] before CREATE Books')
            if(!req.data.title) return req.error(400, 'title cannot be empty')
            if(req.data.price <= 0) return req.error(400, 'The price must be greater than 0.')
        })

        this.on('submitOrder', async req => {
            const {bookID,amount} = req.data
            const book = await SELECT.one.from(Books).where({ID:bookID})

            if(!book)               return req.error(404,'book does not exist')
            if(book.stock == null)  return req.error(500,'Inventory data anomaly')
            if(book.stock < amount) return req.error(409,`Low stock, currently: ${book.stock}`)
            
            await UPDATE(Books)
                .set({stock:book.stock - amount})
                .where({ID:bookID})
            
            return {message:`Order placed successfully! <${book.title}> <${amount}>`}
        })

        this.after('READ',Books,books => {
            if(!books) return
            const list = Array.isArray(books) ? books : [books]
            for(const book of list) {
                book.priceWithTax = +(book.price * 1.1).toFixed(2)
            }
        })

        return super.init()
    }

    async validateStock(bookID,amount) {
        const {Books} = this.entities
        const book = await SELECT.one.from(Books).where({ID:bookID})
        if(!book)               throw new Error('book does not exist')
        if(book.stock == null)  throw new Error('Inventory data anomaly')
        if(book.stock < amount) throw new Error(`Low stock, currently: ${book.stock}`)
        return book
    }
}

module.exports = CatalogService