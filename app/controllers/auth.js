const fs = require('fs')
const { check, validationResult } = require('express-validator')
const tokenLib = require("../libraries/tokenLib")
const generalLib = require("../libraries/generalLib")
const passwordLib = require("../libraries/passwordLib")
const config = require("../config/config")
const lang = require('../language/en.json')
const userModel = require('../models/userModel')
const attemptModel = require('../models/attempModel')
const activityLogModel = require('../models/activityLogModel')
const deviceModel = require("../models/deviceModel")
const portModel = require('../models/portModel')


module.exports = function(app) {
    
    app.post('/auth/login', [ check('username').notEmpty().trim().escape(), check('password').notEmpty().isLength({min: 6}).trim().escape()], async (req, res) => {
        // Check Form Errors
        const errors = validationResult(req)
        if (!errors.isEmpty()) return res.status(422).json(generalLib.formErrors(errors.array()))
        const body = req.body
        const deviceId = req.headers['device-id'] != undefined && req.headers['device-id'] ? req.headers['device-id'] : null 
        const device = await deviceModel.get({filters: {'device_id': deviceId}})
        if(!device) return res.status(404).send({'message': 'device_id not found.'})  
        if(device.status==0) return res.status(403).send({'message': lang.deviePending})
        if(device.status==2) return res.status(403).send({'message': lang.deviceBanned})
        
        const select = 'bin_to_uuid(uid) as uid, name, username, password, phone, role, email, permissions, port, banned, phone, banned_reason, logout_at, logined_at, last_ip, created_at, updated_at'

        // Check Login Attempt
        const attempts = await attemptModel.gets({select: 'created_at', filters: {'user': body.username}})
        
        if(attempts && attempts.length > 4){
            var nowToLastAtt = new Date() - attempts[0]['created_at'] // Time from last attempt till now.
            var waitTime = generalLib.millisToMinutesAndSeconds(300000 - nowToLastAtt) 
            if(nowToLastAtt < 300000){
                return res.status(403).send({'message': `Wait ${waitTime} bofore try login again!` })
            } else {
                const data = {}
                data.id = generalLib.generateUUID()
                data.user = req.body.username,
                data.ip = generalLib.getIp(req)
                data.type = "login"
                data.user_agent = req.headers['user-agent']
                data.device_id = deviceId
                await attemptModel.add(data)
            }
        }
        
        // Check User
        const user = await userModel.get({select: select, filters: {'username': body.username}})
        if(!user) {
            // Add Login Attempt
            const data = {}
            data.id = generalLib.generateUUID()
            data.user = req.body.username,
            data.ip = generalLib.getIp(req)
            data.type = "login"
            data.user_agent = req.headers['user-agent']
            data.device_id = deviceId
            await attemptModel.add(data)
            return res.status(422).send({'type':'user', 'code':'no_found', 'message':lang.userNoFound, 'errors': {'username':{'message':lang.userNoFound}}})
        }
        if(user.banned == 1) return res.status(403).send({'type':'user', 'code':'banned', 'message': lang.userBanned})

        // Check User and Device
        if(user && user.port){ 
            if(device && device.port != user.port) return res.status(403).send({'message': `User port ${user.port} and device port ${device.port} not match.`})
        }
        
        // Check Password
        if(await passwordLib.compare(body.password, user.password) !== true) {

            // Add Login Attempt
            const data = {}
            data.id =  generalLib.generateUUID()
            data.user = req.body.username
            data.uid = user.uid
            data.ip = generalLib.getIp(req)
            data.type = "login"
            data.user_agent = req.headers['user-agent']
            data.device_id = deviceId
            await attemptModel.add(data)
            return res.status(422).send({'type':'user', 'code':'wrong_password' ,'message':lang.incorrectPassword, 'errors': {'password':{'message':lang.incorrectPassword}}})
        }
        
        // Add activity 
        const data = generalLib.loginInfo(user)
        const data_json = generalLib.omit(user, 'password')             
        data_json.logined_at = generalLib.formatDateTime(data_json.logined_at)
        data_json.created_at = generalLib.formatDateTime(data_json.created_at)
        data_json.updated_at = generalLib.formatDateTime(data_json.updated_at)
        data_json.logout_at = generalLib.formatDateTime(data_json.logout_at)


        // Check Port Is Published
        if(result = await portModel.get(device.port, 'code')){
            if(result.published != 1) return res.status(403).send({'message': `Port ${device.port} is not published.`})
        }

        const actBody = {}
        actBody.id = generalLib.generateUUID()
        actBody.port = device.port
        actBody.uid = user.uid
        actBody.ip = generalLib.getIp(req)
        actBody.record_id = data.id
        actBody.device_id = deviceId
        actBody.ref_id = user.username 
        actBody.action = "login"
        actBody.record_type = "users"
        if(user && user.port == null) actBody.port = device.port
        
        await activityLogModel.add(actBody)
        
        // Update last login
        await userModel.update(user.uid, {'logined_at':generalLib.dateTime(), 'last_user_agent':req.headers['user-agent'], 'last_ip': generalLib.getIp(req)})

        // Generate token
        const tokens = await tokenLib.generate(req, user, deviceId)
        
        // Delete User Attempts 
        await attemptModel.delete({filters: { user: body.username}})
        
        // Update User in device table
        await deviceModel.update(deviceId, {'uid': user.uid}, 'device_id')
        
        // Reaspone data
        return res.send({'data':data, 'tokens':tokens})       
    })

    app.post('/auth/logout', async (req, res) => {
        const deviceId = req.headers['device-id'] != undefined && req.headers['device-id'] ? req.headers['device-id'] : null      
        const device = await deviceModel.get({filters: {'device_id': deviceId}})
        if(!device) return res.status(404).send({'message': 'Device not found.'})  
        if(device.status==0) return res.status(403).send({'message': lang.deviceBanned})
        const result = await tokenLib.remove(req)
        if(result.status == 200) {
            userModel.update(result.payload.sub, {'logout_at':generalLib.dateTime()})

            const select = 'bin_to_uuid(uid) as uid, name, username, password, phone, role, email, permissions, port, banned, phone, banned_reason, logout_at, logined_at, last_ip, created_at, updated_at'
        
            const user = await userModel.get({ select: select, filters: {uid: result.payload.sub}}) 
            const data_json = generalLib.omit(user, 'password')             
            data_json.logined_at = generalLib.formatDateTime(data_json.logined_at)
            data_json.created_at = generalLib.formatDateTime(data_json.created_at)
            data_json.updated_at = generalLib.formatDateTime(data_json.updated_at)
            data_json.logout_at = generalLib.formatDateTime(data_json.logout_at)

            try {
                // Add activity
                await activityLogModel.add({
                    'id': generalLib.generateUUID(),
                    'port': device.port,
                    'ip': generalLib.getIp(req),
                    'ref_id': user.username,
                    'record_id': result.payload.sub,
                    'uid': result.payload.sub,
                    'device_id': deviceId,
                    'action': 'logout',
                    'record_type': 'users'
                })
    
                // Delete pdf
                if(fs.existsSync(config.pdfDir+deviceId+'.pdf')){
                    fs.unlink(config.pdfDir+deviceId+'.pdf', (err) => {
                        if (err) throw err;
                    });
                }
             
                // Delete xlsx
                if(fs.existsSync(config.xlsxDir+deviceId+'.xlsx')){
                    fs.unlink(config.xlsxDir+deviceId+'.xlsx', (err) => {
                        if (err) throw err;
                    });
                }
                return res.send({'message':lang.logoutSuccess})
            } catch (error) {
                return res.status(500).send({'message': 'Internal Server Error.'})
            }
        }
        res.status(result.status).send({'message': result.message})
    })

    app.post('/auth/exchange-token', async (req, res) => {
        const token = req.headers["refresh-token"] != undefined && req.headers["refresh-token"] ? req.headers["refresh-token"] : null
        const deviceId = req.headers['device-id'] != undefined && req.headers['device-id'] ? req.headers['device-id'] : null
        if(token) {
            const result = await tokenLib.verify(token, deviceId, false)
  
            if(result.status == 200) {
                // get & check user info
                const user = await userModel.get({select: "*, bin_to_uuid(uid) as uid", filters: {'uid': result.payload.sub}})
            
                if(!user) return res.status(404).send({'message': lang.userNotFound})
                if(user.banned) return res.status(403).send({'message': lang.userBanned})

                // update last login
                userModel.update(user.uid, {'logined_at':generalLib.dateTime(), 'last_user_agent': req.headers['user-agent'], 'last_ip': generalLib.getIp(req)})

                const data = {}
                if(req.body.return_login_info != undefined && req.body.return_login_info == "true") data.data = generalLib.loginInfo(user)
                data.tokens = await tokenLib.generate(req, user, deviceId)
                return res.send(data)
            }
            return res.status(401).send({'message':  result.message})
        }
        res.status(400).send({'message': lang.missingToken})
    })

}