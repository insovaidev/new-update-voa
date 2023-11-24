const { validationResult, check } = require("express-validator");
const checkAuth = require("../middleware/checkAuth");
const generalLib =  require('../libraries/generalLib')
const passwordLib = require('../libraries/passwordLib')
const lang = require('../language/en.json');
const activityLogModel = require("../models/activityLogModel");
const userModel = require("../models/userModel");
const portModel = require('../models/portModel');
const visaModel = require('../models/visaModel');
const visaTypeModel = require("../models/visaTypeModel");
const countryModel = require("../models/countryModel");
const deviceModel = require('../models/deviceModel')
const userSyncModel = require('../models/userSyncModel');
const axios = require("axios");
const config = require("../config/config");


module.exports = function (app) {
    // Check Auth
    app.use('/settings', checkAuth);
    
    // History Lists
    app.get('/settings/histories', async ( req, res ) => {
        const me = req.me
        let data = []
        let total = 0
        let report_time_zone = 0
        const filters = Object.assign({}, req.query) 
        // defualt filters
        filters.limit = 30
        filters.offset = 0

        if(me.port) {
            filters.port = me.port
            if(port = await portModel.get(me.port, 'code')) {
                if(port.report_time_zone) report_time_zone = port.report_time_zone
            }
        }

        if(me.role == 'report' || me.role == 'staff') filters.uid = me.id

        const h = report_time_zone.toString().replace('-','')
        if(start_date = req.query.start_date) filters.start_date = generalLib.dateTime({setDate: start_date, addHour: report_time_zone < 0 ? h : null, minusHour: report_time_zone > 0 ? h : null})
        if(end_date = req.query.end_date) filters.end_date = generalLib.dateTime({setDate: end_date, isEndDate: true, addHour: report_time_zone < 0 ? h : null, minusHour: report_time_zone > 0 ? h : null})
        
        if(req.query.day == 'today') {
            filters.today = { 
                start_date: generalLib.dateTime({ setDate: generalLib.date(), addHour: report_time_zone < 0 ? h : null, minusHour: report_time_zone > 0 ? h : null }),  
                end_date: generalLib.dateTime({ setDate: generalLib.date(), isEndDate: true ,addHour: report_time_zone < 0 ? h : null, minusHour: report_time_zone > 0 ? h : null })
            }
        }

        if(offset = req.query.offset) filters.offset = offset 
      
        const select = 'bin_to_uuid(a.id) id, bin_to_uuid(a.uid) as uid, a.description, a.record_type, a.action, a.port, a.created_at, bin_to_uuid(a.record_id) as record_id, u.username'
        
        try {
            let result = await activityLogModel.list({select: select, filters:filters})
            if(result){
                result.forEach(val => {
                    data.push({
                        'id': val.id,
                        'user_id': val.uid,
                        'record_id': val.record_id,
                        'username': val.username,
                        'description': val.description,   
                        'record_type': val.record_type,
                        'action': val.action,
                        'port': val.port, 
                        'created_at': generalLib.formatDateTime(val.created_at),
                    })
                })
            }
            let result_total = await activityLogModel.gets({ filters: filters})
            console.log(result_total)
            if(result_total) total = result_total[0].total
            return res.send({ 'total': total, 'limit': 30 , 'offset': parseInt(filters.offset), 'data': data.length > 0 ? data : null })
        } catch (error) {
            return res.status(422).send({'code': error.code , 'sql': error.sql,'message': error.sqlMessage})
        }
    })

    // Get a History
    app.get('/settings/histories/:id', async ( req, res ) => {
        const id = req.params.id
        let data = null
        let response = {}
        let select = 'a.data, a.record_type, a.port, a.action, bin_to_uuid(a.uid) as uid, a.created_at, a.description'

        if(!generalLib.uuidValidate(req.params.id)) return res.status(422).send({'message': 'params uuid invalid.'})  

        try {
            let act = await activityLogModel.list({select: select, filters: {'id': id}})
            if(act){
                data=JSON.parse(act[0].data)    
                if(act[0].record_type=='users'){
                    // Auth Action
                    if(act[0].action=='login' || act[0].action=='logout'){
                        const owner = await userModel.get({select: '*', filters: {uid: act[0].uid}})
                        response.username=owner.username
                        if(act[0].port){
                            const port=await portModel.get(act[0].port, 'code')
                            response.port={
                                'code': port.code,
                                'name_km': port.name_km
                            }
                        }
                        // response.port=act[0].port
                        response.created_by=owner.username 
                        response.sex=owner.sex
                        response.role=owner.role
                        response.created_at=generalLib.formatDateTime(owner.created_at) 
                        response.permissions=owner.permissions
                    }

                    // Use Settings
                    if(data){
                        response.username=data.username
                        if(act[0].port){
                            const port=await portModel.get(act[0].port, 'code')
                            response.port={
                                'code': port.code,
                                'name_km': port.name_km
                            }
                        }
                        const owner = await userModel.get({select: 'username', filters: {uid: act[0].uid}})
                        response.created_by=owner.username 
                        response.sex=data.sex
                        response.role=data.role
                        response.created_at=generalLib.formatDateTime(data.created_at) 
                        response.permissions=data.permissions
                    } 
                }

                // Passports
                if(act[0].record_type=='passports'){
                    response.passport_no=data.passport_no
                    const visa = await visaModel.get(data.vid, 'vid')
                    if(visa_type=await visaTypeModel.get(visa.visa_type, 'type')){
                        response.visa_type= {
                            'type': visa_type.type,
                            'entries': visa_type.entries,
                            'duration': visa_type.duration,
                            'duration_type': visa_type.duration_type
                        }
                    }
                    response.given_name=data.given_name 
                    response.surname=data.surname 
                    response.sex=data.sex
                    if(data.nationality){
                        const country = await countryModel.get(data.nationality, 'code')
                        response.nationality= {
                            'country': country.name ,
                            'code': country.code
                        } 
                    }
                    response.dob= generalLib.formatDate(data.dob) 
                    response.pob=data.pob 
                    response.profession=data.profession
                    response.email=data.contact
                    response.issued_date= generalLib.formatDate(data.issued_date) 
                    response.expire_date= generalLib.formatDate(data.expire_date) 
                    response.created_at= generalLib.formatDateTime(data.created_at) 
                    response.updated_at= generalLib.formatDateTime(data.updated_at) 
                    response.deleted_reason=data.deleted_reason
                }
                // Visas
                if(act[0].record_type=='visas'){
                    response.visa_no=data.visa_no
                    response.passport_no=data.passport_no
                    if(data.port){
                        const port=await portModel.get(data.port, 'code')
                        response.port={
                            'code': port.code,
                            'name_km': port.name_km
                        }
                    }
                    response.travel_from=data.travel_from
                    response.final_city=data.final_city
                    if(visa=await visaModel.get(data.vid, 'vid')){
                        const visa_type = await visaTypeModel.get(visa.visa_type, 'type')
                        response.visa_type = {
                            'type': visa_type.type,
                            'entries': visa_type.entries   
                        }
                        response.stay= {
                            'duration': visa_type.duration,
                            'duration_type': visa_type.duration_type,
                        }
                    }
                    // response.description=act.description
                    response.permanent=data.address
                    response.permanent=data.address
                    response.address_in_cambodia=data.address_in_cambodia
                    response.travel_purpose=data.travel_purpose
                    response.created_at=generalLib.formatDateTime(data.created_at)
                    response.updated_at= generalLib.formatDateTime(data.updated_at) 
                    response.deleted_reason=data.deleted_reason  
                }
                response.description=act[0].description
                return res.send({'data': response})
            }
            return res.send({'message': 'Not found'})
        } catch (error) {
            return res.status(422).send({'code': error.code , 'sql': error.sql,'message': error.sqlMessage})
        }
    })


    // Add User
    app.post('/settings/users', [
        check('password').trim().notEmpty().withMessage('Password required')
        .isLength({ min: 6 }).withMessage('password must be minimum 6 length')
        .not().matches(/^$|\s+/).withMessage('White space not allowed'),
        // confirm password validation
        check('confirmPassword').custom((value, { req }) => {
            if (value !== req.body.password) {
                throw new Error('Password Confirmation does not match password');
            }
            return true;
        })
    ],async (req, res) => {
        var data = req.body
        const me = req.me
        const deviceId = req.headers['device-id'] != undefined && req.headers['device-id'] ? req.headers['device-id'] : null  

        // Check Validate 
        const errors = validationResult(req)
        if (!errors.isEmpty()) return res.status(422).json(generalLib.formErrors(errors.array()))

        // Role and Permission
        if (me.role == 'report' || me.role == 'staff' ) return res.status(403).send({'message': `Role ${me.role} can not add a user to the system.`})
        if(['sub_admin', 'staff'].includes(data.role)){
            if(!data.port) return res.status(403).send({'message': `Port is required for role ${data.role}.`})
        } 

        // Admin
        if(me.role=='admin'){
            if(['super_admin'].includes(data.role)) return res.status(403).send({'message': `Role ${me.role} can not assign user ${data.role}.`})
            if(me.port == null ){
                if(data.role == 'admin' && data.port == undefined) return res.status(403).send({'message': `Admin has no port can assign only admin has port.`})
            }
            if(me.port){
                if(['admin'].includes(data.role)) return res.status(403).send({'message': `Role ${me.role} can not assign user ${data.role}.`})
                if(data.role == 'report' && data.port == undefined) return res.status(403).send({'message': `Admin port ${me.port} can assign only report has port ${me.port}.`})
            }
        }

        // Sub Admin
        if(me.role=='sub_admin'){
            if(['super_admin', 'admin', 'sub_admin'].includes(data.role)) return res.status(403).send({'message': `Role ${data.role} can not assign by ${me.role}.`})
            if(me.port) data.port = me.port
        }

        try {
            if(result=await userModel.get({select:'username', filters: { username: data.username }})) {
                return res.status(403).send({'code': 'invalid_username', 'type': 'users', 'message': 'Sorry! The username you provid already exist.'})
            } 

            data.uid = generalLib.generateUUID(me.port)
            data['password'] = await passwordLib.hash(data.password)
            data.last_user_agent = req.headers["user-agent"]
            data.last_ip = generalLib.getIp(req)
            const body = generalLib.omit(data, 'confirmPassword')

            const addUser = await axios.post(config.centralUrl+'users/create', body)
            
            // console.log('dfxdfvsdfg', addUser)

            // Add activity 
            if(addUser && addUser.data.data != undefined){

                // const actData = addUser.data.data
                // actData.logined_at = generalLib.formatDateTime(actData.logined_at)
                // actData.created_at = generalLib.formatDateTime(actData.created_at)
                // actData.updated_at = generalLib.formatDateTime(actData.updated_at)
                // actData.logout_at = generalLib.formatDateTime(actData.logout_at)
                // const device = await deviceModel.get({select: 'port', filters: { 'device_id': deviceId }}) 
                // await activityLogModel.add({
                //     id: generalLib.generateUUID(me.port),
                //     uid: me.id, 
                //     ip: generalLib.getIp(req), 
                //     port: device.port, 
                //     record_id: data.uid,
                //     ref_id: actData.username,
                //     device_id: deviceId,
                //     record_type: 'users', 
                //     action: 'add', 
                //     data: JSON.stringify(actData)
                // })

                return res.status(201).send({'message': 'success'})
            } 
        } catch (error) {
            console.log(error)
            if(error.response && error.response.status == 422) return res.status(422).send({'code': error.response.data.code , 'sql': error.response.data.sql ,'message': error.response.data.sqlMessage})
            if(error.code == 'ECONNREFUSED') return res.status(502).send({'code': error.code ,'address': error.address, 'message': `Can not request to this address ${error.address}:${error.port}`})
            return res.status(422).send({'code': error.code , 'sql': error.sql,'message': error.sqlMessage})
        }


        return 


        
        // Check Duplicate User
        if(result=await userModel.get({select:'username', filters: { username: data.username }})) {
            return res.status(403).send({'code': 'invalid_username', 'type': 'users', 'message': 'Sorry! The username you provid already exist.'})
        } 

        data.uid = generalLib.generateUUID(me.port)
        data['password'] = await passwordLib.hash(data.password);
        data.last_user_agent = req.headers["user-agent"];
        data.last_ip = generalLib.getIp(req);
         

        if(['sub_admin', 'staff'].includes(data.role)){
            if(!data.port) return res.status(403).send({'message': `Port is required for role ${data.role}.`})
        } 

        // Admin
        if(me.role=='admin'){
            if(['super_admin'].includes(data.role)) return res.status(403).send({'message': `Role ${me.role} can not assign user ${data.role}.`})
            if(me.port == null ){
                if(data.role == 'admin' && data.port == undefined) return res.status(403).send({'message': `Admin has no port can assign only admin has port.`})
            }
            if(me.port){
                if(['admin'].includes(data.role)) return res.status(403).send({'message': `Role ${me.role} can not assign user ${data.role}.`})
                if(data.role == 'report' && data.port == undefined) return res.status(403).send({'message': `Admin port ${me.port} can assign only report has port ${me.port}.`})
            }
        }

        // Sub Admin
        if(me.role=='sub_admin'){
            if(['super_admin', 'admin', 'sub_admin'].includes(data.role)) return res.status(403).send({'message': `Role ${data.role} can not assign by ${me.role}.`})
            if(me.port) data.port = me.port
        }
     
        const body = generalLib.omit(data, 'confirmPassword')

        // Request To Createa User
        const addUser = await axios.post(config.centralUrl+'users/create', body)
        // Add activity 
        if(addUser && addUser.data.data != undefined){
            const actData = addUser.data.data
            actData.logined_at = generalLib.formatDateTime(actData.logined_at)
            actData.created_at = generalLib.formatDateTime(actData.created_at)
            actData.updated_at = generalLib.formatDateTime(actData.updated_at)
            actData.logout_at = generalLib.formatDateTime(actData.logout_at)
            const device = await deviceModel.get({select: 'port', filters: { 'device_id': deviceId }}) 
            await activityLogModel.add({
                id: generalLib.generateUUID(me.port),
                uid: me.id, 
                ip: generalLib.getIp(req), 
                port: device.port, 
                record_id: data.uid,
                ref_id: actData.username,
                device_id: deviceId,
                record_type: 'users', 
                action: 'add', 
                data: JSON.stringify(actData)
            })
            return res.status(201).send({'message': 'success'})
        } 
        const status = addUser.data.status
        if(status == 422) return res.status(422).send({'message': addUser.data.message})
        if(status == 403) return res.status(403).send({'message': addUser.data.message})
    })

    // Users Lists
    app.get('/settings/users', async (req, res) => {
        var total = 0
        let data = []
        const me = req.me
        const filters = Object.assign({}, req.query)

        // Not Allowed
        if(['report', 'staff'].includes(me.role)) return res.status(403).send({'message': `Role ${me.role} can not get users.`})
        
        var select = 'bin_to_uuid(uid) as uid, name, username, phone, email, sex, created_at, role, port, banned, banned_reason, permissions'
        
        // me.port = "PHN"
        
        if(me.role=='admin'){
            if(me.port==null){
                filters.admin_has_port = 0
            }

            if(me.port){
                filters.admin_has_port = 1
                filters.port = me.port    
            } 
        }
    
        if(me.role=='sub_admin'){
            filters.port = me.port
            filters.not_role = ['super_admin', 'admin', 'sub_admin']
        }

        if(limit = req.query.limit){
            filters.limit = limit 
        }  else {
            filters.limit = 30    
        }

        if(offset = req.query.offset) {
            filters.offset = offset 
        } else {
            filters.offset = 0
        }
    
        if(filters && filters.uid){
            if(!generalLib.uuidValidate(filters.uid)) return res.status(422).send({'message': 'params uuid invalid.'})
        }

        // List
        if(result = await userModel.list({select: select, filters:filters})){
            result.forEach(val => {
                data.push({...val})
            })
        }
        
        // Total
        if(result=await userModel.total({filters:filters})){
            total = result[0].total
        }
    
        res.send({'total': total, 'limit': 30 , 'offset': parseInt(filters.offset),  'data': data.length > 0 ? data : null})
    })

    // Update User Profile 
    app.patch('/settings/profile', async (req, res) => {
        const data = Object.assign({}, req.body) 
        const me = req.me
        const updateData = {}
        let action = null
        let statusMsg = 'Updated successfully'
        const deviceId = req.headers['device-id'] != undefined && req.headers['device-id'] ? req.headers['device-id'] : null  

        if(data.username){
            if(result=await userModel.get({select: 'username', filters: { username: data.username }})){
                return res.status(403).send({'message': `User name ${data.username} already exist.`})
            } 
            updateData.username=data.username
        }
        
        if(data){
            if(('email' in data)){
                if(data.email !== ""){
                    updateData.email = data.email 
                } else {
                    updateData.email = null
                }
            } 
            if(('phone' in data)){
                if(data.phone !== ""){
                    updateData.phone = data.phone 
                } else {
                    updateData.phone = null
                }
            } 
            if(data.name) updateData.name=data.name
            if(data.sex) updateData.sex=data.sex
        }
        
        if(data.old_password && data.password){
            const user = await userModel.get({select:'password', filters: { uid: me.id }})
            if(await passwordLib.compare(data.old_password, user.password) !== true) return res.status(422).send({'type':'user', 'code':'wrong_password' ,'message':lang.incorrectPassword, 'errors': {'password':{'message': 'old password incorrect.'}}})
            if(data.password != data.confirmPassword) return res.status(403).send({'message': 'comfirmPassword not match.'})
            updateData.password = await passwordLib.hash(data.password)
            action = 'change_password'
            statusMsg = 'Password change successfully' 
        }

        // Update User
        if(await userModel.update(me.id, updateData)){
            // Get User Just Updated & Add Log
            if(user= await userModel.get({select:'bin_to_uuid(uid) as uid,name,username,sex,phone,email,role,permissions,port,photo,banned,banned_reason,logined_at,logout_at,last_ip,last_user_agent,created_at,updated_at', filters: {uid: me.id}})){
                const data_json = generalLib.omit(user, 'password') 
                data_json.logined_at = generalLib.formatDateTime(data_json.logined_at)
                data_json.created_at = generalLib.formatDateTime(data_json.created_at)
                data_json.updated_at = generalLib.formatDateTime(data_json.updated_at)
                data_json.logout_at = generalLib.formatDateTime(data_json.logout_at)
                if(!me.port) device = await deviceModel.get({select: 'port', filters: { 'device_id': deviceId }}) 

                // add user_sync record
                await userSyncModel.add({
                    'id': user.uid,
                    'status': 1,
                    'created_at': generalLib.formatDateTime(user.created_at),
                    'updated_at': generalLib.formatDateTime(user.updated_at),
                })

                await activityLogModel.add({
                    id: generalLib.generateUUID(me.port),
                    uid: me.id,
                    ip: generalLib.getIp(req), 
                    port: me.port ? me.port : device.port,
                    record_id: me.id,
                    ref_id: user.username, 
                    device_id: deviceId,
                    record_type: 'users', 
                    action: action ? action :'edit',
                    data: JSON.stringify(data_json)
                }) 
            }
        }
        return res.send({'message': statusMsg })
    })
    
    // Update a User
    app.patch('/settings/users/:id', async (req, res ) => {
        var data = req.body
        const me = req.me 
        const deviceId = req.headers['device-id'] != undefined && req.headers['device-id'] ? req.headers['device-id'] : null  

        if(!generalLib.uuidValidate(req.params.id)) return res.status(422).send({'message': 'Params uuid invalid.'})  

        // Not allowed update user    
        if(['report', 'staff'].includes(me.role)) return res.status(403).send({'message': `Role ${me.role} can not update a user.`})
        // Get user
        if(!(result=await userModel.get({select: 'username, port, role', filters: { uid: req.params.id}}))) return res.status(404).send({'message':'User not found.'})
        
        // Deplicate Users 
        if(data.username != result.username){
            if(exist= await userModel.get({filters: {'username': data.username}})) return res.status(403).send({'message':'Username already exist.'})
        }
        
        // Super Admin
        if(me.role == 'super_admin'){
            if(!(['admin', 'report'].includes(result.role))) {
                if(!data.port || data.port.toUpperCase() =='NULL') return res.status(403).send({'message': `Update user that has role ${result.role} port is required.`})
            }
            data.port = data.port ? data.port : null
        }
        // Admin
        if(me.role=='admin'){
            if(data.role && ['super_admin'].includes(data.role)) return res.send({'message': `As admin can not assign user to role super_admin.`})
            // Admin no port
            if(me.port==null){
                if(!(['report'].includes(result.role))) {
                    if(!data.port || data.port.toUpperCase() =='NULL') return res.status(403).send({'message': `Admin has no port can only update Admin has port.`})
                }
                data.port = data.port ? data.port : null
            }
            // Admin has port
            if(me.port) {
                if(!data.port || data.port != me.port) return res.status(403).send({'message': `This Admin can only assign user to port ${me.port}.`})
            }
        }
    
        // Sub Admin
        if(me.role=='sub_admin'){
            if(data.role){
                if(['super_admin', 'admin', 'sub_admin'].includes(data.role)) return res.status(403).send({'message': `As sub_admin can not assign user to role ${data.role}.`})
            }
            if(data.port && me.port!==data.port) return res.send({'message': `This user can only assign to port ${me.port}.`})
        }

        if(data.password){
            if(data.password != data.confirmPassword) return res.status(403).send({'message': 'comfirmPassword not match.'})
            data.password = await passwordLib.hash(data.password)
        }
        const body = generalLib.omit(data, 'confirmPassword')     
    
        // Request Updata to central
        const updateUser = await axios.post(config.centralUrl+`users/update/${req.params.id}`, body)
        // Add activity 
        if(updateUser && updateUser.data.data != undefined){
            const actData = updateUser.data.data
            actData.logined_at = generalLib.formatDateTime(actData.logined_at)
            actData.created_at = generalLib.formatDateTime(actData.created_at)
            actData.updated_at = generalLib.formatDateTime(actData.updated_at)
            actData.logout_at = generalLib.formatDateTime(actData.logout_at)
            const device = await deviceModel.get({select: 'port', filters: { 'device_id': deviceId }}) 
            await activityLogModel.add({
                id: generalLib.generateUUID(me.port),
                uid: me.id, 
                ip: generalLib.getIp(req), 
                port: device.port, 
                record_id: req.params.id,
                ref_id: actData.username,
                device_id: deviceId,
                record_type: 'users', 
                action: 'edit', 
                data: JSON.stringify(actData)
            })
            return res.status(201).send({'message': 'Updated successfully'})
        } 

        const status = updateUser.data.status
        if(status == 422) return res.status(422).send({'message': updateUser.data.message})
        if(status == 403) return res.status(403).send({'message': updateUser.data.message})
        res.send({'message': 'Updated successfully'})
    })

    // Get a User
    app.get('/settings/users/:id', async (req, res ) => {
        const me = req.me    
        let data = null
        const filters = { uid: req.params.id }
    
        if(!generalLib.uuidValidate(req.params.id)) return res.status(422).send({'message': 'params uuid invalid.'})
        
        if(['report', 'staff'].includes(me.role)) return res.status(422).status(403).send({'message': `Role ${me.role} can not get a user.`})

        if(result = await userModel.get({select: 'bin_to_uuid(uid) as uid, name, username, sex, phone, email, role, port, banned, banned_reason, permissions', filters: filters})){
            data = result
        } 
        
        res.send({'data': data})
    })

    // Banned a User
    app.patch('/settings/banned/:id', async (req, res) => {
        const body = req.body
        const me = req.me
        const filters = { uid: req.params.id }
        const deviceId = req.headers['device-id'] != undefined && req.headers['device-id'] ? req.headers['device-id'] : null

        if(['report', 'staff'].includes(me.role)) return res.status(403).send({'message': `Role ${me.role} can not do this action.`})
    
        if(!generalLib.uuidValidate(req.params.id)) return res.status(422).send({'message': 'params uuid invalid.'})

        if(user = await userModel.get({select: '*, bin_to_uuid(uid) as uid',filters: filters})){
            const dataBanned = {}
            let statusMsg = 'Banned'
            if(body){
                if(body.banned_reason && body.banned_reason.length) dataBanned.banned_reason = req.body.banned_reason 
                if(body.banned && body.banned.length){
                    dataBanned.banned = req.body.banned
                    if(body.banned == 0) {
                        statusMsg= 'Unbanned'
                        dataBanned.banned_reason = null
                    }
                } 
            }
            const updateUser = await axios.post(config.centralUrl+`users/update/${req.params.id}`, dataBanned)
            // Add activity 
            if(updateUser && updateUser.data.data != undefined){
                const actData = updateUser.data.data
                actData.logined_at = generalLib.formatDateTime(actData.logined_at)
                actData.created_at = generalLib.formatDateTime(actData.created_at)
                actData.updated_at = generalLib.formatDateTime(actData.updated_at)
                actData.logout_at = generalLib.formatDateTime(actData.logout_at)
                const device = await deviceModel.get({select: 'port', filters: { 'device_id': deviceId }}) 
                await activityLogModel.add({
                    id: generalLib.generateUUID(me.port),
                    uid: me.id, 
                    ip: generalLib.getIp(req), 
                    port: device.port, 
                    record_id: req.params.id,
                    ref_id: actData.username,
                    device_id: deviceId,
                    record_type: 'users', 
                    action: 'edit', 
                    data: JSON.stringify(actData)
                })
                const status = updateUser.data.status
                if(status == 422) return res.status(422).send({'message': updateUser.data.message})
                if(status == 403) return res.status(403).send({'message': updateUser.data.message})
                return res.send({'message': `${statusMsg} success`})
            } 
        }
        return res.status(404).send({'message': 'User Not Found'})
    })
}
