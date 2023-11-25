const checkAuth = require('../middleware/checkAuth')
const generalLib = require('../libraries/generalLib')
const visaModel = require('../models/visaModel')
const activityLogModel = require('../models/activityLogModel')
const userModel = require('../models/userModel')
const printedVisasModel = require('../models/printedVisasModel')


module.exports = function(app) {

    // Apply authentication
    app.use('/prints', checkAuth)

    // Mark Print
    app.post('/prints/mark_print', async (req, res) => {
        const body = req.body
        const me = req.me
        const deviceId = req.headers['device-id'] != undefined && req.headers['device-id'] ? req.headers['device-id'] : null

        // Role and Permission
        if(me.role=='super_admin' || me.role=='admin' || me.role=='report') return res.status(403).send({'message': `Role ${me.role} is not allowed to print visa.`})
        try {
            if(me.role=='staff' && (user = await userModel.get({ select: 'permissions', filters: { uid: me.id }}))){
                let perms=[]
                if(!user.permissions) return res.status(403).send({'message':'Do not have permission to request data.'})       
                perms.push(...user.permissions.split(','));
                if(!perms.includes('print_visa')) return res.status(403).send({'message':'Do not have permission to print visa.'})
            }
            if(result=await visaModel.get({select:'bin_to_uuid(v.vid) as vid, p.sex, p.passport_id ,p.nationality, v.visa_type', filters:{'vid': body.vid ,'deleted': '0'}})){
                // Update Print
                await visaModel.updatePrint(body.vid)            
                // Add Print Record
                await printedVisasModel.add({
                    id: generalLib.generateUUID(me.port),
                    vid: result.vid,
                    uid: me.id,
                    port: me.port,
                    passport_id: result.passport_id,
                    nationality: result.nationality,
                    visa_type: result.visa_type,
                    sex: result.sex
                })
                if(visa=await visaModel.get({select: 'v.*, bin_to_uuid(v.vid) as vid, bin_to_uuid(v.uid) as uid' , filters:{'vid': body.vid, 'deleted': '0'}})){
                    let dataJSON =  visa
                    dataJSON.attachments = JSON.parse(visa.attachments)
                    dataJSON.passport_expire_date = generalLib.formatDate(visa.passport_expire_date)
                    dataJSON.entry_at = generalLib.formatDateTime(visa.entry_at)
                    dataJSON.created_at = generalLib.formatDateTime(visa.created_at)
                    dataJSON.updated_at = generalLib.formatDateTime(visa.updated_at)
                    dataJSON.printed_at = generalLib.formatDateTime(visa.printed_at)
                    dataJSON.deleted_at = generalLib.formatDateTime(visa.deleted_at)
                    dataJSON.expire_date = generalLib.formatDate(visa.expire_date)
                    dataJSON.issued_date = generalLib.formatDate(visa.issued_date)
                    await activityLogModel.add({
                        id: generalLib.generateUUID(me.port),
                        uid: me.id, 
                        ip: generalLib.getIp(req), 
                        port: me.port,  
                        record_id: body.vid,
                        record_type: 'visas',
                        ref_id: visa.visa_id,
                        device_id: deviceId,
                        action: 'print', 
                        data: JSON.stringify(dataJSON)
                    })
                }
                return res.status(200).send({'message': 'success'})
            }
            return res.status(404).send({'message': 'Not Found'})
        } catch (error) {
            return res.status(422).send({'code': error.code , 'sql': error.sql, 'message': error.sqlMessage}) 
        }
    })

}


