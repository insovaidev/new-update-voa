const checkAuth = require('../middleware/checkAuth')
const generalLib = require('../libraries/generalLib')
const passportModel = require('../models/passportModel')
const checklistModel = require('../models/checklistModel')
const visaTypeModel = require('../models/visaTypeModel')
const visaModel = require('../models/visaModel')
const activityLogModel = require('../models/activityLogModel')
const userModel = require('../models/userModel')
const deletedVisasModel = require('../models/deletedVisasModel')
const config = require('../config/config')
const fileLib = require('../libraries/fileLib')
const portModel = require('../models/portModel')
const countryModel = require('../models/countryModel')
const deviceModel = require('../models/deviceModel')


module.exports = function (app) {

    // Check Auth
    app.use('/visas', checkAuth)

    // Add Visa
    app.post('/visas', async (req, res) => {
        const body = req.body
        const me = req.me
        const deviceId = req.headers['device-id'] != undefined && req.headers['device-id'] ? req.headers['device-id'] : null
        const filters = Object.assign({}, body)
        filters.lastDay = 1

        // Role and Permission
        if(me.role && ['super_admin', 'admin', 'report'].includes(me.role)) return res.status(403).send({ 'message': `Role ${me.role} is not allowed to add visa.` })
        try {
            if (me.role == 'staff' && (user = await userModel.get({ select: 'permissions', filters: { uid: me.id } }))) {
                let perms = []
                if (!user.permissions) return res.status(403).send({ 'message': 'Do not have permission to request data.' })
                perms.push(...user.permissions.split(','));
                if (!perms.includes('add_visa')) return res.status(403).send({ 'message': 'Do not have permission to view visa.' })
            }
            filters.port = me.port
            // Get Recent
            if (await visaModel.get({ filters: { 'passport_id': body.passport_id, 'minusHour': '4', deleted: '0' } })) return res.status(422).send({ 'message': 'The passport already has a visa. Please delete it first before you issue it again!' })

            const checklist = await checklistModel.get({ select: 'bin_to_uuid(id) as id, base_id, passport_id, passport_no, issued_date, expire_date, surname, given_name, sex, dob, nationality, data, bin_to_uuid(uid) as uid, port, match_als, status_code, als_message, als_response,data', filters: { lastDay: 1, port: me.port } })

            if (!checklist) return res.status(404).send({ 'code': 'not_found', 'type': 'checklists', 'message': "Sorry! We could not find the passport's checklist using the passport_id you provided." })
            // Match
            if (checklist.match_als == 1) return res.status(403).send({ 'code': 'invalid_status', 'type': 'checklists', 'message': checklist.als_message })

            // Avoid Duplicate
            if (await visaModel.get({ filters: { vid: checklist.id } })) return res.status(403).send({ 'message': 'Not allowed. Please scan your passport to check the black list first.' })
            // Visa Type
            const visa_type = await visaTypeModel.get(req.body.visa_type, 'type')
            if (!visa_type) return res.status(404).send({ 'code': 'not_found', 'type': 'visa_types', 'message': 'Sorry! The visa type that you provided was not found.' })

            // Prepare Data Upload
            const p_body = {}
            const visa_body = {}
            if (checklist.match_als == '0') visa_body.base_id = checklist.base_id ? checklist.base_id : null
            if (body.visa_type) visa_body.visa_type = body.visa_type.toUpperCase()
            if (body.remarks) visa_body.remarks = body.remarks
            if (body.travel_purpose) visa_body.travel_purpose = body.travel_purpose
            if (body.travel_no) visa_body.travel_no = body.travel_no
            if (body.travel_from) visa_body.travel_from = body.travel_from
            if (body.final_city) visa_body.final_city = body.final_city
            if (body.profession) p_body.profession = body.profession
            if (body.phone) p_body.phone = body.phone
            if (body.email) p_body.email = body.email
            if (body.pob) p_body.pob = body.pob
            if (body.address) p_body.address = body.address
            if (body.address_in_cambodia) p_body.address_in_cambodia = body.address_in_cambodia
            if (body.officer_notes) visa_body.officer_notes = body.officer_notes

            // Passports Body
            p_body.pid = generalLib.strToUUID(checklist.passport_id)
            p_body.passport_id = checklist.passport_id
            p_body.passport_no = checklist.passport_no
            p_body.issued_date = generalLib.formatDate(checklist.issued_date)
            p_body.expire_date = generalLib.formatDate(checklist.expire_date)
            p_body.full_name = checklist.given_name + " " + checklist.surname
            p_body.sex = checklist.sex
            p_body.given_name = checklist.given_name
            p_body.surname = checklist.surname
            p_body.dob = generalLib.formatDate(checklist.dob)
            p_body.nationality = checklist.nationality
            p_body.uid = checklist.uid
            p_body.port = checklist.port
            p_body.vid = checklist.id
            p_body.entry_at = generalLib.dateTime()

            // Visa Body
            visa_body.passport_id = checklist.passport_id.toUpperCase()
            visa_body.sex = checklist.sex
            visa_body.nationality = checklist.nationality
            visa_body.issued_date = generalLib.date()
            visa_type.duration_type == 'passport_expire_date'
            visa_body.expire_date = visa_type && visa_type.duration_type == 'passport_expire_date' ? generalLib.formatDate(checklist.expire_date) : generalLib.visaExpiredDate(visa_type)
            visa_body.passport_expire_date = generalLib.formatDate(checklist.expire_date)
            visa_body.port = checklist.port
            visa_body.uid = checklist.uid
            visa_body.vid = checklist.id
            visa_body.visa_type = body.visa_type

            // Get attachments from Checklist
            if (result = JSON.parse(checklist.data)) { // attachments
                const attachments = {} // attachments for add to visas, passports
                const passportId = checklist.passport_id
                const port = checklist.port
                // Copy file in checklists to attachments folder
                if (result.attachments) {
                    if (result.attachments.photo != undefined && result.attachments.photo) {
                        if (!fileLib.exist(config.tmpDir + result.attachments.photo)) return res.status(422).send({ 'message': 'Photo file not found.' })
                        if (file = fileLib.copyTo(config.tmpDir + result.attachments.photo, port, passportId)) attachments.photo = file.dir
                    }
                    if (result.attachments.passport != undefined && result.attachments.passport) {
                        if (!fileLib.exist(config.tmpDir + result.attachments.passport)) return res.status(422).send({ 'message': 'Passport file not found.' })
                        if (file = fileLib.copyTo(config.tmpDir + result.attachments.passport, port, passportId)) attachments.passport = file.dir
                    }
                }

                if (Object.values(attachments).length > 0) {
                    p_body.attachments = JSON.stringify(attachments)
                    visa_body.attachments = JSON.stringify(attachments)
                }
            }

            const passport = await passportModel.get({ filters: { passport_id: body.passport_id } })

            let actionPassport = 'add'
            if (!passport) {
                await passportModel.add(p_body)
            } else {
                actionPassport = 'edit'
                const dataUpdate = Object.assign({})
                if (body.profession) dataUpdate.profession = body.profession
                if (body.phone) dataUpdate.phone = body.phone
                if (body.email) dataUpdate.email = body.email
                if (body.pob) dataUpdate.pob = body.pob
                if (body.address) dataUpdate.address = body.address
                if (body.address_in_cambodia) dataUpdate.address_in_cambodia = body.address_in_cambodia
                dataUpdate.vid = checklist.id
                dataUpdate.port = checklist.port
                await passportModel.update(body.passport_id, dataUpdate, idType = 'passport_id')
            }

            await visaModel.add(visa_body)

            // Get Last Passport
            if (lastPassport = await passportModel.get({ select: '*, bin_to_uuid(pid) as pid,bin_to_uuid(vid) as vid, bin_to_uuid(uid) as uid', filters: { pid: p_body.pid } })) {
                const data = Object.assign({}, lastPassport)
                data.passport_issued_date = generalLib.formatDate(lastPassport.passport_issued_date)
                data.entry_at = generalLib.formatDateTime(lastPassport.entry_at)
                data.expire_date = generalLib.formatDate(lastPassport.expire_date)
                data.issued_date = generalLib.formatDate(lastPassport.issued_date)
                data.dob = generalLib.formatDate(lastPassport.dob)
                data.created_at = generalLib.formatDateTime(lastPassport.created_at)
                data.updated_at = generalLib.formatDateTime(lastPassport.updated_at)
                if (lastPassport.attachments) {
                    if (Object.values(lastPassport.attachments).length > 0) data.attachments = JSON.parse(lastPassport.attachments)
                }

                await activityLogModel.add({
                    id: generalLib.generateUUID(me.port),
                    uid: me.id,
                    ip: generalLib.getIp(req),
                    port: me.port,
                    record_id: lastPassport.pid,
                    ref_id: lastPassport.passport_id,
                    device_id: deviceId,
                    action: actionPassport,
                    record_type: 'passports',
                    data: JSON.stringify(data)
                })
            }

            if (visa = await visaModel.get({ select: 'v.*, bin_to_uuid(v.vid) as vid, bin_to_uuid(v.uid) as uid', filters: { vid: checklist.id } })) {
                const data = Object.assign({}, visa)
                // Fromat Data 
                data.passport_expire_date = generalLib.formatDate(visa.passport_expire_date)
                data.entry_at = generalLib.formatDateTime(visa.entry_at)
                data.created_at = generalLib.formatDateTime(visa.created_at)
                data.updated_at = generalLib.formatDateTime(visa.updated_at)
                data.expire_date = generalLib.formatDate(visa.expire_date)
                data.issued_date = generalLib.formatDate(visa.issued_date)
                data.deleted_at = generalLib.formatDate(visa.deleted_at)
                data.printed_at = generalLib.formatDate(visa.printed_at)
                if (visa.attachments) {
                    if (Object.values(visa.attachments).length > 0) data.attachments = JSON.parse(visa.attachments)
                }

                await activityLogModel.add({
                    id: generalLib.generateUUID(me.port),
                    uid: me.id,
                    ip: generalLib.getIp(req),
                    port: me.port,
                    record_id: visa.vid,
                    ref_id: lastPassport.passport_id,
                    device_id: deviceId,
                    record_type: 'visas',
                    action: 'add',
                    data: JSON.stringify(data)
                })
            }
            return res.send({ 'message': 'success' }) 
        } catch (error) {
            return res.status(422).send({'code': error.code , 'sql': error.sql, 'message': error.sqlMessage})
        } 
    })

    // Get Recent Visa
    app.post('/visas/recent', async (req, res) => {
        let result = null
        const body = req.body
        const me = req.me
        const filters = Object.assign({}, body)
        filters.minusHour = '4'
        filters.deleted = '0'

        // Role and Permission
        if (me.role == 'report') return res.status(403).send({ 'message': `Role ${me.role} is not allowed to view visa.` })
        try {
            if (me.role == 'staff' && (user = await userModel.get({ select: 'permissions', filters: { uid: me.id } }))) {
                let perms = []
                if (!user.permissions) return res.status(403).send({ 'message': 'Do not have permission to request data.' })
                perms.push(...user.permissions.split(','));
                if (!perms.includes('view_visa')) return res.status(403).send({ 'message': 'Do not have permission to view visa.' })
            }
    
            // Select
            const select = 'bin_to_uuid(v.vid) as vid, p.passport_no, p.surname,p.full_name,p.given_name, p.port, v.remarks, p.nationality, p.pob,p.phone,p.issued_date as passport_issued_date, p.expire_date as passport_expire_date, p.dob, p.sex, p.profession, p.email, v.visa_id, v.visa_no, v.visa_no_on_photo, v.travel_no, v.visa_type, v.travel_from, p.address, p.address_in_cambodia, p.entry_at, v.travel_purpose, v.final_city, v.created_at, v.printed, v.printed_at, v.officer_notes, v.expire_date, v.issued_date, v.attachments'
    
            if (result = await visaModel.get({ select: select, filters: filters })) {
                const visaType = await visaTypeModel.get(result.visa_type)
                result.dob = generalLib.formatDate(result.dob)
                result.passport_issued_date = generalLib.formatDate(result.passport_issued_date)
                result.passport_expire_date = generalLib.formatDate(result.passport_expire_date)
                result.created_at = generalLib.formatDateTime(result.created_at)
                result.printed_at = generalLib.formatDateTime(result.printed_at)
                result.entry_at = generalLib.formatDateTime(result.entry_at)
                result.issued_date = generalLib.formatDate(result.issued_date)
                result.expire_date = generalLib.formatDate(result.expire_date)
                result.entries = visaType.entries
                result.price = visaType.price
                if (result.attachments) {
                    const data = JSON.parse(result.attachments)
                    const attachments = Object.assign({})
                    if (data.photo) attachments.photo = { "path": data.photo, "url": config.baseUrl + config.uploadDir + data.photo }
                    if (data.passport) attachments.passport = { "path": data.passport, "url": config.baseUrl + config.uploadDir + data.passport }
                    if (data.visa) attachments.visa = { "path": data.visa, "url": config.baseUrl + config.uploadDir + data.visa }
                    result.attachments = attachments
                }
                return res.status(200).send({ 'data': result })
            }
            return res.status(404).send({ 'message': 'No visa' })
            
        } catch (error) {
            return res.status(422).send({'code': error.code , 'sql': error.sql, 'message': error.sqlMessage})
        }
        
    })

    // Update Attachments Visa
    app.post('/visas/attachments', async (req, res) => {
        const body = req.body
        const attachments = body.attachments != undefined && body.attachments ? JSON.parse(body.attachments) : null
        const deviceId = req.headers['device-id'] != undefined && req.headers['device-id'] ? req.headers['device-id'] : null
        const me = req.me
        const bodyUpdate = Object.assign({})

        if (body && body.vid) {
            if (!generalLib.uuidValidate(body.vid)) return res.status(422).send({ 'message': 'params uuid invalid.' })
        }

        // Role and Permissions
        if(me.role && ['super_admin', 'admin', 'report'].includes(me.role)) return res.status(403).send({ 'message': `Role ${me.role} is not allowed to scan visa.` })

        try {
            // Allowed Role sub_admin & Role staff that have permissions 
            if (me.role == 'staff' && (user = await userModel.get({ select: 'permissions', filters: { uid: me.id } }))) {
                let perms = []
                if (!user.permissions) return res.status(403).send({ 'message': 'Do not have permission to request data.' })
                perms.push(...user.permissions.split(','));
                if (!perms.includes('scan_visa')) return res.status(403).send({ 'message': 'Do not have permission to scan visa for attachments.' })
            }

            if (result = await visaModel.get({ select: 'v.passport_id, v.attachments,v.visa_type, v.printed', filters: { 'vid': body.vid, 'deleted': '0' } })) {
                if (result.printed && !attachments) return res.status(422).send({ 'message': 'Attachment visa photo is required.' })
                const data_attechments = Object.assign({}, result.attachments ? JSON.parse(result.attachments) : {})
                const port = me.port
                const passportId = result.passport_id
                if (!me.port) device = await deviceModel.get({ select: 'port', filters: { 'device_id': deviceId } })

                // Get attechments
                if (attachments) {
                    if (attachments.visa != undefined && attachments.visa) {
                        if (!fileLib.exist(config.tmpDir + attachments.visa)) return res.status(422).send({ 'message': 'Visa file not found.' })
                        if (file = fileLib.copyTo(config.tmpDir + attachments.visa, port, passportId)) data_attechments.visa = file.dir
                    }
                    if (attachments.passport != undefined && attachments.passport) {
                        if (!fileLib.exist(config.tmpDir + attachments.passport)) return res.status(422).send({ 'message': 'Passport file not found.' })
                        if (file = fileLib.copyTo(config.tmpDir + attachments.passport, port, passportId)) data_attechments.passport = file.dir
                    }
                    if (attachments.photo != undefined && attachments.photo) {
                        if (!fileLib.exist(config.tmpDir + attachments.photo)) return res.status(422).send({ 'message': 'Photo file not found.' })
                        if (file = fileLib.copyTo(config.tmpDir + attachments.photo, port, passportId)) data_attechments.photo = file.dir
                    }
                }
                // Update Attachments
                bodyUpdate.attachments = JSON.stringify(data_attechments)

                if (body.visa_no) {
                    bodyUpdate.visa_id = [result.visa_type, body.visa_no].join("-").toUpperCase()
                    bodyUpdate.visa_no = body.visa_no
                    bodyUpdate.scanned = '1'
                }
                if (body.visa_no_on_photo) bodyUpdate.visa_no_on_photo = body.visa_no_on_photo

                await visaModel.update(body.vid, bodyUpdate, idType = 'vid')

                if (visa = await visaModel.get({ select: 'v.*,bin_to_uuid(v.vid) as vid, bin_to_uuid(v.uid) as uid', filters: { vid: body.vid } })) {
                    let dataJSON = visa
                    if (visa.attachments) {
                        if (Object.values(visa.attachments).length > 0) dataJSON.attachments = JSON.parse(visa.attachments)
                    }
                    dataJSON.passport_expire_date = generalLib.formatDate(visa.passport_expire_date)
                    dataJSON.entry_at = generalLib.formatDateTime(visa.entry_at)
                    dataJSON.created_at = generalLib.formatDateTime(visa.created_at)
                    dataJSON.updated_at = generalLib.formatDateTime(visa.updated_at)
                    dataJSON.printed_at = generalLib.formatDateTime(visa.printed_at)
                    dataJSON.expire_date = generalLib.formatDate(visa.expire_date)
                    dataJSON.issued_date = generalLib.formatDate(visa.issued_date)
                    dataJSON.deleted_at = generalLib.formatDate(visa.deleted_at)

                    await activityLogModel.add({
                        id: generalLib.generateUUID(me.port),
                        uid: me.id,
                        ip: generalLib.getIp(req),
                        port: me.port ? me.port : device.port,
                        record_id: body.vid,
                        device_id: deviceId,
                        ref_id: visa.visa_id,
                        action: 'scan',
                        record_type: 'visas',
                        data: JSON.stringify(dataJSON)
                    })
                }

                return res.send({ 'message': 'success' })
            }
            return res.status(404).send({ 'message': 'Not Found' })
        } catch (error) {
            return res.status(422).send({'code': error.code , 'sql': error.sql, 'message': error.sqlMessage})
        }
        
    })

    // Update Deleted Visa
    app.post('/visas/delete', async (req, res) => {
        const body = req.body
        const me = req.me
        const attachments = req.body.attachments != undefined && req.body.attachments ? JSON.parse(req.body.attachments) : null
        const deviceId = req.headers['device-id'] != undefined && req.headers['device-id'] ? req.headers['device-id'] : null

        if (body && body.vid) {
            if (!generalLib.uuidValidate(body.vid)) return res.status(422).send({ 'message': 'params uuid invalid.' })
        }

        // Role and Permissions
        if(me.role && ['super_admin', 'admin', 'report'].includes(me.role)) return res.status(403).send({ 'message': `Role ${me.role} is not allowed to scan visa.` })

        try {
            // Allowed Role sub_admin & Role staff that have permissions 
            if (me.role == 'staff' && (user = await userModel.get({ select: 'permissions', filters: { uid: me.id } }))) {
                let perms = []
                if (!user.permissions) return res.status(403).send({ 'message': 'Do not have permission to request data.' })
                perms.push(...user.permissions.split(','));
                if (!perms.includes('delete_visa')) return res.status(403).send({ 'message': 'Do not have permission to delete visa.' })
            }

            // Get Recent
            if (result = await visaModel.get({ select: 'p.sex, p.passport_id ,p.nationality, v.visa_type, v.attachments, v.printed', filters: { 'vid': body.vid, 'deleted': '0' } })) {
                if (result.printed && !attachments) return res.status(422).send({ 'message': 'An attachment photo is required.' })
                const port = me.port
                const passportId = result.passport_id
                if (!me.port) device = await deviceModel.get({ select: 'port', filters: { 'device_id': deviceId } })

                // Delete Visa Body
                const data_attachments = Object.assign({}, JSON.parse(result.attachments)) // for update attachments in deleted_visas
                const dataDelete = Object.assign({}, generalLib.omit(body, 'attachments'))
                dataDelete.id = generalLib.generateUUID(me.port)
                dataDelete.deleted_at = generalLib.dateTime()
                dataDelete.uid = me.id
                dataDelete.port = me.port ? me.port : device.port
                dataDelete.sex = result.sex
                dataDelete.passport_id = result.passport_id
                dataDelete.nationality = result.nationality
                dataDelete.visa_type = result.visa_type

                if (attachments) {
                    if (attachments.passport != undefined && attachments.passport) {
                        if (!fileLib.exist(config.tmpDir + attachments.passport)) return res.status(422).send({ 'message': 'Passport file not found.' })
                        if (file = fileLib.copyTo(config.tmpDir + attachments.passport, port, passportId)) data_attachments.passport = file.dir
                    }
                    if (attachments.visa != undefined && attachments.visa) {
                        if (!fileLib.exist(config.tmpDir + attachments.visa)) return res.status(422).send({ 'message': 'Visa file not found.' })
                        if (file = fileLib.copyTo(config.tmpDir + attachments.visa, port, passportId)) data_attachments.visa = file.dir
                    }
                }
                if (data_attachments) {
                    if (Object.values(data_attachments).length > 0) dataDelete.attachments = JSON.stringify(data_attachments)
                }

                // Update Visa 
                await visaModel.updateDelete(body.vid)

                await deletedVisasModel.add(dataDelete)

                if (visa = await visaModel.get({ select: 'v.*, bin_to_uuid(v.vid) as vid, bin_to_uuid(v.uid) as uid', filters: { vid: body.vid } })) {
                    let dataJSON = visa
                    if (data_attachments) {
                        if (Object.values(data_attachments).length > 0) dataJSON.attachments = JSON.stringify(data_attachments)
                    }
                    dataJSON.passport_expire_date = generalLib.formatDate(visa.passport_expire_date)
                    dataJSON.entry_at = generalLib.formatDateTime(visa.entry_at)
                    dataJSON.created_at = generalLib.formatDateTime(visa.created_at)
                    dataJSON.updated_at = generalLib.formatDateTime(visa.updated_at)
                    dataJSON.printed_at = generalLib.formatDateTime(visa.printed_at)
                    dataJSON.deleted_at = generalLib.formatDateTime(visa.deleted_at)
                    dataJSON.expire_date = generalLib.formatDate(visa.expire_date)
                    dataJSON.issued_date = generalLib.formatDate(visa.issued_date)
                    if (body.reason) dataJSON.reason = body.reason

                    await activityLogModel.add({
                        id: generalLib.generateUUID(me.port),
                        uid: me.id,
                        ip: generalLib.getIp(req),
                        port: me.port ? me.port : device.port,
                        record_id: body.vid,
                        ref_id: visa.visa_id,
                        device_id: deviceId,
                        action: 'delete',
                        record_type: 'visas',
                        data: JSON.stringify(dataJSON)
                    })
                }
                return res.send({ 'message': 'success' })
            }
            return res.status(404).send({ 'message': 'Not Found' })   
        } catch (error) {
            return res.status(422).send({'code': error.code , 'sql': error.sql, 'message': error.sqlMessage})
        }
    })

    // Get Count Visa
    app.get('/visas/count', async (req, res) => {
        let not_printed = 0
        let not_attached = 0
        let deleted = 0
        const me = req.me

        if (me.role == 'report') return res.status(403).send({ 'message': `Role ${me.role} is not allowed to read applications.` })

        const deleteFilters = Object.assign({})
        deleteFilters.deleted = '1'

        const printFilters = Object.assign({})
        printFilters.printed = '0'
        printFilters.deleted = '0'

        const scannedFilters = Object.assign({})
        scannedFilters.scanned = '0'
        scannedFilters.deleted = '0'

        if (me.port) {
            deleteFilters.port = me.port
            printFilters.port = me.port
            scannedFilters.port = me.port
        }
        try {
            await Promise.all([
                visaModel.total({ filters: deleteFilters }).then(result => {
                    if (result) deleted = result[0].total
                }),
    
                visaModel.total({ filters: printFilters }).then(result => {
                    if (result) not_printed = result[0].total
                }),
    
                visaModel.total({ filters: scannedFilters }).then(result => {
                    if (result) not_attached = result[0].total
                }),
            ])
            return res.send({ 'deleted': deleted, 'not_printed': not_printed, 'not_attached': not_attached })
        } catch (error) {
            return res.status(422).send({'code': error.code , 'sql': error.sql, 'message': error.sqlMessage})
        }
    })

    // Get List Visas 
    app.get('/visas', async (req, res) => {
        let total = 0
        let data = []
        let report_time_zone = 0
        const filters = Object.assign({}, req.query)
        const me = req.me
        // Role and Permission
        if (me.role == 'report') return res.status(403).send({ 'message': `Role ${me.role} is not allowed to read applications.` })
        try {
            if (me.role != 'super_admin' && me.role != 'admin' && me.role != 'sub_admin' && (user = await userModel.get({ select: 'permissions', filters: { uid: me.id } }))) {
                let perms = []
                if (!user.permissions) return res.status(403).send({ 'message': 'Do not have permission to request data.' })
                perms.push(...user.permissions.split(','));
                if (!perms.includes('view_visa')) return res.status(403).send({ 'message': 'Do not have permission to read applications.' })
            }
    
            if (me.port) {
                filters.port = me.port
                if (port = await portModel.get(me.port, 'code')) {
                    if (port.report_time_zone) report_time_zone = port.report_time_zone
                }
            } else {
                if (port = await portModel.get(me.port, 'code')) {
                    if (port.report_time_zone) report_time_zone = port.report_time_zone
                }
            }
    
    
            const h = report_time_zone.toString().replace('-', '')
            if (start_date = req.query.start_date) filters.start_date = generalLib.dateTime({ setDate: req.query.start_date, addHour: report_time_zone < 0 ? h : null, minusHour: report_time_zone > 0 ? h : null })
            if (end_date = req.query.end_date) filters.end_date = generalLib.dateTime({ setDate: req.query.end_date, isEndDate: true, addHour: report_time_zone < 0 ? h : null, minusHour: report_time_zone > 0 ? h : null })
    
            if (limit = req.query.limit) {
                filters.limit = limit
            } else {
                filters.limit = 30
            }
    
            if (offset = req.query.offset) {
                filters.offset = offset
            } else {
                filters.offset = 0
            }
            
            var select = 'bin_to_uuid(p.pid) as pid,p.passport_no,p.expire_date as passport_expire_date,p.nationality,p.sex,p.full_name,p.created_at,p.updated_at, bin_to_uuid(v.vid) as vid, v.visa_no, v.base_id, v.visa_type,v.issued_date,v.expire_date,v.scanned,v.printed,v.deleted'
    
            const lists = await passportModel.list({ select: select, filters: filters })
    
            // Get Country
            const countries = {};
            if (result = await countryModel.gets()) {
                result.forEach((val) => {
                    countries[val.code] = val
                })
            }
    
            // List Passports
            if (lists) {
                lists.forEach(val => {
                    data.push({
                        'passport': {
                            'pid': val.pid,
                            'passport_no': val.passport_no,
                            'full_name': val.full_name,
                            'sex': val.sex,
                            'expire_date': generalLib.formatDate(val.passport_expire_date)
                        },
                        'vid': val.vid,
                        'country': countries[val.nationality].name,
                        'country_code': countries[val.nationality].code,
                        'visa_no': val.visa_no,
                        'base_id': val.base_id ? val.base_id : null,
                        'visa_type': val.visa_type,
                        'scanned': val.scanned,
                        'printed': val.printed,
                        'deleted': val.deleted,
                        'issued_date': generalLib.formatDate(val.issued_date),
                        'expire_date': generalLib.formatDate(val.expire_date)
                    })
                })
            }
    
            // Get Total Record
            if (result = await passportModel.total({ filters: filters })) {
                total = result[0].total
            }
            return res.send({ 'total': total, 'limit': 30, 'offset': parseInt(filters.offset), 'data': data.length > 0 ? data : null })
        } catch (error) {
            return res.status(422).send({'code': error.code , 'sql': error.sql, 'message': error.sqlMessage})
        }
    })

    // Get a Visa
    app.get('/visas/:id', async (req, res) => {
        let data = null
        const id = req.params.id
        const me = req.me
        const reaspone = Object.assign({ visa: null, passport: null })
        
        if (!generalLib.uuidValidate(req.params.id)) return res.status(422).send({ 'message': 'params uuid invalid.' })
        // Role and Permission
        if (me.role == 'report') return res.status(403).send({ 'message': `Role ${me.role} is not allowed to read applications.` })
        try {
            if (me.role == 'staff' && (user = await userModel.get({ select: 'permissions', filters: { uid: me.id } }))) {
                let perms = []
                if (!user.permissions) return res.status(403).send({ 'message': 'Do not have permission to request data.' })
                perms.push(...user.permissions.split(','));
                if (!perms.includes('view_visa')) return res.status(403).send({ 'message': 'Do not have permission to read applications.' })
            }
    
            if (visa = await visaModel.get({ select: 'v.passport_id', filters: { 'vid': id } })) {
                // Get Visa Attachments
                if (visaAttachments = await visaModel.get({ select: 'v.attachments', filters: { 'vid': id, sort: 'updated_at' } })) {
                    const pathAttachments = JSON.parse(visaAttachments.attachments)
    
                    if (pathAttachments) {
                        if (pathAttachments.photo) pathAttachments.photo = config.baseUrl + config.uploadDir + pathAttachments.photo
                        if (pathAttachments.passport) pathAttachments.passport = config.baseUrl + config.uploadDir + pathAttachments.passport
                        if (pathAttachments.visa) pathAttachments.visa = config.baseUrl + config.uploadDir + pathAttachments.visa
                    }
                    reaspone.visaAttachmentsData = pathAttachments
                }
    
                if (visaData = await activityLogModel.listVisaData({ select: 'bin_to_uuid(uid) as uid, action, data', filters: { 'record_type': 'visas', 'record_id': id } })) {
                    const b = await Promise.all(visaData.map(async item => {
                        let dataParse = JSON.parse(item.data)
                        dataParse = generalLib.omit(dataParse, 'sex', 'uid', 'vid', 'port', 'deleted', 'printed', 'scanned', 'visa_id', 'entry_at', 'nationality', 'passport_id', 'visa_no_on_photo', 'passport_expire_date')
                        dataParse.attachments = dataParse.attachments && typeof (dataParse.attachments) == 'string' ? JSON.parse(dataParse.attachments) : dataParse.attachments
    
                        // Attachment as URL
                        dataParse.attachments = {
                            'visa': dataParse.attachments && dataParse.attachments.visa ? config.baseUrl + config.uploadDir + dataParse.attachments.visa : null,
                            'photo': dataParse.attachments && dataParse.attachments.photo ? config.baseUrl + config.uploadDir + dataParse.attachments.photo : null,
                            'passport': dataParse.attachments && dataParse.attachments.passport ? config.baseUrl + config.uploadDir + dataParse.attachments.passport : null,
                        }
    
                        // User That Make this action on this visa
                        const user = await userModel.get({ select: 'name, username, sex, role, port', filters: { 'uid': item.uid } })
    
                        return {
                            by_user: user ? user : null,
                            action: item.action,
                            data: dataParse
                        };
                    }))
                    reaspone.visa = b
                }
    
                // Get Passport
                if (result = await passportModel.get({ select: 'attachments, passport_no, issued_date, expire_date, full_name, sex, nationality, email, phone, dob, pob, profession, created_at, updated_at, address_in_cambodia, address', filters: { 'passport_id': visa.passport_id } })) {
                    let passportData = result
                    if (passportData && passportData.attachments) {
                        passportData.attachments = passportData.attachments && typeof (passportData.attachments) == 'string' ? JSON.parse(passportData.attachments) : passportData.attachments
                        passportData.attachments = {
                            'photo': passportData.attachments.photo ? config.baseUrl + config.uploadDir + passportData.attachments.photo : null,
                            'passport': passportData.attachments.passport ? config.baseUrl + config.uploadDir + passportData.attachments.passport : null,
                        }
                    }
                    passportData.dob = generalLib.formatDate(passportData.dob)
                    passportData.issued_date = generalLib.formatDate(passportData.issued_date)
                    passportData.expire_date = generalLib.formatDate(passportData.expire_date)
                    passportData.created_at = generalLib.formatDateTime(passportData.created_at)
                    passportData.updated_at = generalLib.formatDateTime(passportData.updated_at)
                    reaspone.passport = passportData
                }
    
                // Result
                data = reaspone
                return res.send({ 'data': data })
            }
            return res.status(404).send({ 'message': 'Not Found' })
            
        } catch (error) {
            return res.status(422).send({'code': error.code , 'sql': error.sql, 'message': error.sqlMessage})
        }
    })
}

    