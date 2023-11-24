const db = require('../services/dbService')
const generalLib = require('../libraries/generalLib')

const table = "activity_logs"

module.exports = {

    getActivitySync: async function({select=null, filters=null}={}){
        const q = db(table+' as a')
        
        // Select
        q.select()
        if(select) q.select(db.raw(select))
        
        // Join
        q.join(db.raw('activity_logs_sync'+' as s on a.id=s.id'))
        
        // Sort
        q.orderBy('s.sid', 'asc')
 
        // Where condition
        if(filters){
            if(filters.sid) q.where('s.sid', '>', parseInt(filters.sid))
        }
 
        // Return data
        const result = await q
        return result && result.length ? result : null
    },
    
    get: async function({select=null, filters=null}={}) {
        const q = db(table)
        q.select()
        if(select) q.select(db.raw(select)) 
        if(filters){
            if(filters.id) q.whereRaw('id=uuid_to_bin('+"'"+filters.id+"'"+')')
        }

        const result = await q
        return result && result.length ? result : null
    },
    addSync: async function(data){
        const body = generalLib.omit(data, 'id', 'uid', 'record_id')
        body.created_at = generalLib.formatDateTime(body.created_at)
        const result  = await db(table).insert({id: db.raw('uuid_to_bin("'+data.id+'")'), record_id: db.raw('uuid_to_bin("'+data.record_id+'")'), uid: db.raw('uuid_to_bin("'+data.uid+'")'), ...body})
        return result? data.id : null
    },

    add: async function(data) {
        const body = generalLib.omit(data, 'id', 'uid', 'record_id')
        body.created_at = generalLib.dateTime()
        const result  = await db(table).insert({id: db.raw('uuid_to_bin("'+data.id+'")'), record_id: db.raw('uuid_to_bin("'+data.record_id+'")'), uid: db.raw('uuid_to_bin("'+data.uid+'")'), ...body})
        return result? data.id : null
    },

    getData: async function(record_id, record_type,  { action=null, port=null}={}) {        
        if(!record_id) return false
        return await db.select('data', 'action')
        .table(table)
        .where((builder) => {
            if(port) builder.where('port', port)
            if(action) builder.where('action', action)
            builder.where('record_type', record_type)
            builder.whereRaw('record_id = uuid_to_bin('+"'"+record_id+"'"+')')
        }).orderBy('created_at', 'desc').limit(1).first()
    },  

    listVisaData: async function({select=null, filters=null}={}){
        const q = db(table)
        
        q.select()

        if(select) q.select(db.raw(select))
        if(filters){
            if(filters.record_type) q.where('record_type', filters.record_type)
            if(filters.record_id) q.whereRaw('record_id = uuid_to_bin('+"'"+filters.record_id+"'"+')')
        }
        q.orderBy('created_at', 'asc')
        const result = await q
        return result && result.length ? result : null
    },


    list: async function({select=null,  filters}={}) {
        
        console.log(filters)

        const q = db(table+ ' as a') 
    
        // Select Fields
        q.select()
        if(select) q.select(db.raw(select))

        this.filters(q, filters)

        // Sort
        q.limit(30)
        q.offset(filters && filters.offset != undefined ? filters.offset : 0)
        q.orderBy(filters && filters.sort != undefined ? 'a.'+filters.sort : 'a.created_at', filters && filters.sort_value != undefined ? filters.sort_value : 'desc' )
        

        q.join(db.raw('users'+' as u on u.uid = a.uid'))


        // Return Result
        const result = await q
        return result && result.length ? result : null
    },

    gets: async function({select=null, groupBy=null, filters}={}){
        const q = db(table+ ' as a')

        // Select Fields
        if(select || groupBy) q.select(db.raw(select ?? groupBy))
        q.count('* as total')

        this.filters(q, filters)

        // Group By Record
        if(groupBy) q.groupBy(db.raw(groupBy))

        // Return Result
        const result = await q
        return result && result.length ? result : null
    },

    filters: function(q, filters=null) {
        if(filters) {
            if(filters.today) q.where('a.created_at', '>=', filters.today.start_date)
            if(filters.today) q.where('a.created_at', '<=', filters.today.end_date)
            if(filters.start_date) q.where('a.created_at', '>=', filters.start_date)
            if(filters.end_date) q.where('a.created_at', '<=', filters.end_date)
            if(filters.port) q.where('a.port', filters.port) 
            if(filters.action) q.where('a.action', filters.action.toUpperCase())
            if(filters.uid) q.whereRaw('a.uid = uuid_to_bin('+"'"+filters.uid+"'"+')')
            if(filters.id) q.whereRaw('a.id = uuid_to_bin('+"'"+filters.id+"'"+')')
            if(filters.record_id) q.whereRaw('a.record_id = uuid_to_bin('+"'"+filters.record_id+"'"+')')
            if(filters.record_type) q.where('a.record_type', filters.record_type)
        }
    }    
}


