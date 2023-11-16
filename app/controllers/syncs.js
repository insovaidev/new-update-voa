const activityLogModel = require("../models/activityLogModel")
const portModel = require("../models/portModel")
const userModel = require("../models/userModel")
const visaModel = require("../models/visaModel")
const visaTypeModel = require('../models/visaTypeModel')
const countryModel = require('../models/countryModel')
const passportModel = require('../models/passportModel')
const checklistModel = require("../models/checklistModel")
const printedVisasModel = require('../models/printedVisasModel')
const deletedVisasModel = require('../models/deletedVisasModel')
const fs = require('fs')
const config = require('../config/config')
const axios = require('axios')


module.exports = function(app) {

    // SUB
    app.post('/syncs/users_from_central', async (req, res, next) => {        
        var sync_logs = {}
        if(result = fs.readFileSync('sync_logs')) sync_logs = JSON.parse(result)
        var sid = sync_logs.users != undefined ? sync_logs.users : 0  
        try {    
            const request = await axios.post(config.centralUrl+'syncs/users_to_sub', {'sid': parseInt(sid)})    
            if(request && request.data != null && request.data.data) {
                    for(var i in request.data.data) {
                        var val = request.data.data[i]
                        // check record
                        if(sid<=val.sid) sid = val.sid
                        delete val.sid
                        const user = await userModel.get({select: '*', filters: {'uid': val.uid}})
                        if(user) {
                            await userModel.updateSync(request.data.data[i])
                        } else {
                            await userModel.addSync(request.data.data[i])
                        }
                    }
                }
                sync_logs.users = sid
                fs.writeFileSync('sync_logs', JSON.stringify(sync_logs))
                res.send({'id': sid })
        } catch (error) {
            next()
            // res.status(201).send({'message': 'CONFUSE SERVER'})
        }
    })


    // VOA
    app.post('/syncs/users_to_sub', async (req, res) => {
        var data = []
        if(req.body.sid != undefined) {
          var sid = req.body.sid
          data = await userModel.sync({select: 'u.*, bin_to_uuid(u.uid) as uid, s.sid', filters: {'sid': sid }}) 
        }
        res.send({'data': data && data.length ? data : null})
    })


    // SUB 
    app.post('/syncs/users_profile_to_central', async (req, res) => {
        var sync_logs = {}
        if(result = fs.readFileSync('sync_logs')) sync_logs = JSON.parse(result)
        var sid = sync_logs.profile != undefined ? sync_logs.profile : 0       
        const data = await userModel.getUserSync({select: 'bin_to_uuid(u.uid) as uid, u.password, u.phone, u.sex, u.name, u.email, u.updated_at, s.sid' , filters: {'sid': sid}})     
        
        console.log(data)
        
        if(data){
            const lastSid = data[0].sid
            try {
                const result = await axios.post(config.centralUrl+'syncs/users_profile_from_sub', { 'data': data })
                if(result && result.status==200){
                    sync_logs.profile = lastSid
                    fs.writeFileSync('sync_logs', JSON.stringify(sync_logs))
                    return res.send({'message': 'sync success'})
                }
            } catch (error) {
                // console.log('sync error')
            }
        }
        return res.status(200).send({'message': 'Nothing update'})
    })


    // VOA 
    app.post('/syncs/users_profile_from_sub', async (req, res) => {
        const body = req.body
        if(body != null && body.data){
            try {
                for( i in body.data){
                    const val = body.data[i]
                    const result = await userModel.getOne({select: 'bin_to_uuid(uid) as uid', filters: {'uid': val.uid}})     
                    if(result){
                        await userModel.updateProfileSync(val.uid, val, 'uid')
                    } 
                }
                return res.status(200).send({'message': 'sync success'})    
            } catch (error) {
                return res.status(422).send({'message': error.message })   
            }
        }
        return res.status(200).send({'message': 'Nothing is update'})
    })

    // VOA
    app.post('/syncs/ports_to_sub', async (req, res) => {
        var data = []
        if(req.body.sid != undefined) {
          var sid = req.body.sid
          data = await portModel.sync({select: 'p.*, bin_to_uuid(p.id) as id, s.sid', filters: {'sid': sid }}) 
        }
        res.send({'data': data && data.length ? data : null})
    })

    app.post('/syncs/ports_from_central', async (req, res, next) => {
        var sync_logs = {}
        let request = null;
        if(result = fs.readFileSync('sync_logs')) sync_logs = JSON.parse(result)
        var sid = sync_logs.ports != undefined ? sync_logs.ports : 0 
        try {
            request = await axios.post(config.centralUrl+'syncs/ports_to_sub', {'sid': parseInt(sid)})    
            if(request.data != null && request.data.data) {
                for(var i in request.data.data) {
                    var val = request.data.data[i]
                    // check record
                    if(sid<=val.sid) sid = val.sid
                    delete val.sid
                    const port = await portModel.getOne({select: '*', filters: {'id': val.id}})
                    if(port) {
                        await portModel.updateSync(request.data.data[i])
                    } else {
                        await portModel.addSync(request.data.data[i])
                    }
                }
            }

            sync_logs.ports = sid
            fs.writeFileSync('sync_logs', JSON.stringify(sync_logs))
            res.send({'id':sid})
        } catch (error) {
            next()
        }
    })





    app.post('/syncs/visa_types', async (req, res) => {
        var data = []
        if(req.body.sid != undefined) {
          var sid = req.body.sid
          data = await visaTypeModel.sync({select: 'vt.*, bin_to_uuid(vt.id) as id, s.sid', filters: {'sid': sid }}) 
        }
        res.send({'data': data && data.length ? data : null})
    })

    app.post('/syncs/countries', async (req, res) => {
        var data = []
        if(req.body.sid != undefined) {
          var sid = req.body.sid
          data = await countryModel.sync({select: 'c.*, bin_to_uuid(c.id) as id, s.sid', filters: {'sid': sid }}) 
        }
        res.send({'data': data && data.length ? data : null})
    })

    app.post('/syncs/activity_logs', async (req, res) => {
        const body = req.body
        if(body != null && body.data){
            try {
                for( i in body.data){
                    const val = body.data[i]
                    const activity_logs = await activityLogModel.get({select: '*', filters: {'id': val.id}})
                    if(activity_logs == null){
                        await activityLogModel.addSync(body.data[i])
                    }
                }
                return res.status(200).send({'message': 'sync success'})    
            } catch (error) {
             // console.log('error')
                return res.status(422).send({'message': error.message })   
            }
        }
        return res.status(200).send({'message': 'Nothings update'})
    })
    
    app.post('/syncs/visas', async (req, res) => {
        const body = req.body
        if(body != null && body.data){
            try {
                for( i in body.data){
                    const val = body.data[i]
                    const result = await visaModel.getOne({select: 'bin_to_uuid(vid) as vid', filters: {'vid': val.vid}})
                    if(result == null){
                        await visaModel.addSync(body.data[i])
                    } else {
                        await visaModel.updateSync(result.vid, val, 'vid')
                    }   
                }
                return res.status(200).send({'message': 'sync success'})    
            } catch (error) {
             // console.log('error')
             return res.status(422).send({'message': error.message })   
            }
        }
        return res.status(200).send({'message': 'Nothing is update'})
    })

    app.post('/syncs/passports', async (req, res) => {
        const body = req.body
        if(body != null && body.data){
            try {
                for( i in body.data){
                    const val = body.data[i]
                    const result = await passportModel.getOne({select: 'bin_to_uuid(pid) as pid', filters: {'pid': val.pid}})
                    if(result == null){
                        await passportModel.addSync(val)
                    } else {
                        await passportModel.updateSync(result.pid, val, 'pid')
                    }   
                }
                return res.status(200).send({'message': 'sync success'})    
            } catch (error) {
             // console.log('error')
             return res.status(422).send({'message': error.message })   
            }
        }
        return res.status(200).send({'message': 'Nothing is update'})
    })

    app.post('/syncs/checklists', async (req, res) => {
        const body = req.body
        if(body != null && body.data){
            try {
                for( i in body.data){
                    const val = body.data[i]
                    const result = await checklistModel.getOne({select: 'bin_to_uuid(id) as id', filters: {'id': val.id}})
                    if(result==null){
                        await checklistModel.addSync(body.data[i])
                    } else {
                        await checklistModel.updateSync(result.id, val, 'id')
                    }   
                }
                return res.status(200).send({'message': 'sync success'})    
            } catch (error) {
             // console.log('error')
             return res.status(422).send({'message': error.message })   
            }
        }
        return res.status(200).send({'message': 'Nothing is update'})
    })

    app.post('/syncs/printed_visas', async (req, res) => {
        const body = req.body
        if(body != null && body.data){
            try {
                for( i in body.data){
                    const val = body.data[i]
                    const result = await printedVisasModel.getOne({select: 'bin_to_uuid(id) as id', filters: {'id': val.id}})
                    if(result==null){
                        await printedVisasModel.addSync(body.data[i])
                    } else {
                        await printedVisasModel.updateSync(result.id, val, 'id')
                    }   
                }
                return res.status(200).send({'message': 'sync success'})    
            } catch (error) {
             // console.log('error')
             return res.status(422).send({'message': error.message })   
            }
        }
        return res.status(200).send({'message': 'Nothing is update'})
    })

    app.post('/syncs/deleted_visas', async (req, res) => {
        const body = req.body
        // console.log(body)
        if(body != null && body.data){
            try {
                for( i in body.data){
                    const val = body.data[i]
                    const result = await deletedVisasModel.getOne({select: 'bin_to_uuid(id) as id', filters: {'id': val.id}})                    
                    if(result==null){
                        await deletedVisasModel.addSync(body.data[i])
                    } else {
                        await deletedVisasModel.updateSync(result.id, val, 'id')
                    }   
                }
                return res.status(200).send({'message': 'sync success'})    
            } catch (error) {
             // console.log('error')
             return res.status(422).send({'message': error.message })   
            }
        }
        return res.status(200).send({'message': 'Nothing is update'})
    })

    app.post('/syncs/profile', async (req, res) => {
        const body = req.body
        if(body != null && body.data){
            try {
                for( i in body.data){
                    const val = body.data[i]
                    const result = await userModel.getOne({select: 'bin_to_uuid(uid) as uid', filters: {'uid': val.uid}})     
                    if(result){
                        await userModel.updateSync(val.uid, val, 'uid')
                    } 
                }
                return res.status(200).send({'message': 'sync success'})    
            } catch (error) {
             // console.log('error')
             return res.status(422).send({'message': error.message })   
            }
        }
        return res.status(200).send({'message': 'Nothing is update'})
    })

}