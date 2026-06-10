const CatalogService = require('./cat-service')

// AdminService inherits from CatalogService
// Automatically inherits all handlers from the parent class, such as before CREATE and after READ
class AdminService extends CatalogService {
    async init() {
        const {Books} = this.entities

        // The new handler added in the subclass
        this.on('resetStock', async req => {
            const {bookID,amount} = req.data

            this.validateStock(bookID, amount)
            
            const book = await SELECT.one.from(Books)
                .where({ID:bookID})
            if(!book) return req.error(404,'book does not exist')
            
            await UPDATE(Books)
                .set({stock:100})
                .where({ID:bookID})
            
            return {message:`The inventory of <${book.title}> has been reset to 100.`}
        })

        // Subclass overrides parent class's before CREATE
        // Completely replaces parent class's validation logic
        this.before('CREATE',Books,req => {
            console.log('[AdminService] Administrators create books, skipping price verification.')
        })

        return super.init()
    }
}

module.exports = AdminService
