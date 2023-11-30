const generalLib = require('../libraries/generalLib')
const db = require('../services/dbService')
const table = "users"

module.exports = {

    get: async function({select=null, filters=null}={}) {
        const q = db(table) 
        
        q.select()

        if(select) q.select(db.raw(select))

        // Apply Where Condition
        if(filters){
            if(filters.username) q.where('username', filters.username)  
            if(filters.uid) q.whereRaw('uid = UUID_TO_BIN('+"'"+filters.uid+"'"+');')
        }
        
        // Return Result
        const result = await q
        return result && result[0] && result.length ? result[0] : null

    },

    update: async function(id, data, idType="uid") {
        data.updated_at = generalLib.dateTime()
        const result = await db(table).update(data).whereRaw('uid = uuid_to_bin('+"'"+id+"'"+')')
        return result == 1
    },

    add: async function(data) {
        
        const body = generalLib.omit(data, 'uid')
        body.created_at = generalLib.dateTime()
        body.updated_at = generalLib.dateTime()
        const result  = await db(table).insert({uid: db.raw('uuid_to_bin("'+data.uid+'")'),...body})
        return result[0]
    },

    list: async function({select=null,  filters}={}) {
        const q = db(table) 

        // Select Fields
        q.select()
        if(select) q.select(db.raw(select))
        
        // Filters        
        this.filters(q, filters)
        

        if(filters && filters.no_limit == 0) q.limit(30) // condition for list select that no limit 
        q.offset(filters && filters.offset != undefined ? filters.offset : 0)
        
        // Sort
        q.orderBy('created_at', filters && filters.sort_value != undefined ? filters.sort_value : 'desc')


        // Return Result
        const result = await q

        return result && result.length ? result : null

    },

    total: async function({select=null,  filters}={}) {
        const q = db(table) 

        // Select Fields
        // q.select()
        if(select) q.select(db.raw(select))

        q.count('* as total')
        
        this.filters(q, filters)

        // Return Result
        const result = await q
        return result && result.length ? result : null

    },
    
    sync: async function({select=null,  filters}={}){
        const q = db(table + ' as u')  

        // Select Fields
        q.select()
        if(select) q.select(db.raw(select))  
        
        // Join table
        q.join(db.raw('users_sync'+' as s on u.uid=s.id'))
        
        // Sort
        q.orderBy('s.sid', 'asc')

        // Where condition
        if(filters){
            if(filters.sid) q.where('s.sid', '>', filters.sid)  
        }

        // Return 
        const result = await q;
       
        return result && result.length ? result : null

    },
    
    filters: function(q, filters=null) {
        if(filters) {          
            if(filters.search_value) q.whereRaw(`username LIKE '%${filters.search_value}%'`)
            if(filters.username) q.where('username', filters.username)
            if(filters.uid) q.whereRaw('uid = uuid_to_bin('+"'"+filters.uid+"'"+')')
            if(filters.not_role) q.whereNotIn('role', filters.not_role)
            if(filters.port) q.where('port', filters.port)
            if(filters.sex) q.where('sex', filters.sex)
            // when get histories
            if(filters.in_role) q.whereIn('role', filters.in_role)
            if(filters.role) q.where('role', filters.role)

            // filter for admin 
            if(filters.admin_has_port == 0){
                q.whereRaw(`(role = 'admin' AND port IS NOT NULL) OR role in ('report', 'staff', 'sub_admin')`);
                if(filters.search_value) q.whereRaw(`username LIKE '%${filters.search_value}%'`)
                if(filters.uid) q.whereRaw('uid = uuid_to_bin('+"'"+filters.uid+"'"+')')
                if(filters.role) q.whereRaw(`role = '${filters.role}'`)
                if(filters.port) q.whereRaw(`port = '${filters.port}'`)
                if(filters.sex) q.whereRaw(`sex = '${filters.sex}'`)
            }
            if(filters.admin_has_port == 1){
                q.whereRaw(`role in ('report', 'staff', 'sub_admin')`)
                if(filters.search_value) q.whereRaw(`username LIKE '%${filters.search_value}%'`)
                if(filters.uid) q.whereRaw('uid = uuid_to_bin('+"'"+filters.uid+"'"+')')
                if(filters.role) q.whereRaw(`role = '${filters.role}'`)
                if(filters.port) q.whereRaw(`port = '${filters.port}'`)
                if(filters.sex) q.whereRaw(`sex = '${filters.sex}'`)
            }
        }
    },

    getOne: async function({select=null, filters=null}={}) {
        const q = db(table) 
        q.select()
        if(select) q.select(db.raw(select))
        // Apply Where Condition
        if(filters){
            if(filters.username) q.where('username', filters.username)
            if(filters.uid) q.whereRaw('uid = UUID_TO_BIN('+"'"+filters.uid+"'"+');')
        }
        
        // Return Result
        const result = await q
        return result && result[0] && result.length ? result[0] : null
    },

    updateProfileSync: async function(id, data, idType="uid") {
        const body = generalLib.omit(data, 'uid', 'sid')
        body.updated_at = generalLib.formatDateTime(data.updated_at)
        const result = await db(table).update(body).whereRaw('uid = uuid_to_bin('+"'"+id+"'"+')')
        return result == 1
    },

    addSync: async function(data){
        const body = generalLib.omit(data, 'uid')
        body.logined_at = generalLib.formatDateTime(data.logined_at)
        body.logout_at = generalLib.formatDateTime(data.logout_at)
        body.created_at = generalLib.formatDateTime(data.created_at)
        body.updated_at = generalLib.formatDateTime(data.updated_at)
        const result  = await db(table).insert({uid: db.raw('uuid_to_bin("'+data.uid+'")'),...body})
        return result[0]       
    },

    updateSync: async function(data){
        const body = generalLib.omit(data, 'uid', 'last_user_agent', 'last_ip', 'logout_at', 'logined_at')        
        body.created_at = generalLib.formatDateTime(data.created_at)
        body.updated_at = generalLib.formatDateTime(data.updated_at)
        const result = await db(table).update(body).whereRaw('uid = uuid_to_bin('+"'"+data.uid+"'"+')')
        return result == 1    
    },

    getUserSync: async function({select=null, filters=null}={}){
        const q = db(table+' as u')
        // Select
        q.select()
        if(select) q.select(db.raw(select))
        
        // Join
        q.join(db.raw('users_sync'+' as s on u.uid=s.id'))
        
        // Sort
        q.orderBy('s.sid', 'desc')
 
        // Where condition
        if(filters){
            if(filters.sid) q.where('s.sid', '>', parseInt(filters.sid))
        }
        // Return data
        const result = await q
        return result && result.length ? result : null
    },
    
}


