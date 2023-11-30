const fs = require('fs')
const config = require('../config/config')
const axios = require('axios')
const FormData = require('form-data');
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
const activityLogSyncModel = require('../models/activityLogSyncModel')
const checklistSyncModel = require('../models/checklistSyncModel')
const passportSyncModel = require('../models/passportSyncModel')
const visaSyncModel = require('../models/visaSyncModel') 
const printedVisasSyncModel = require('../models/printedVisasSyncModel')
const deletedVisasSyncModel = require('../models/deletedVisasSyncModel');


module.exports = function(app) {

    // SUB SERVER CALL
    app.post('/syncs/users_from_central', async (req, res, next) => {      
        var sync_logs = {}
        if(result = await fs.readFileSync('sync_logs')) sync_logs = JSON.parse(result)
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
    // CENTRAL
    app.post('/syncs/users_to_sub', async (req, res) => {
        var data = []
        if(req.body.sid != undefined) {
            var sid = req.body.sid
            data = await userModel.sync({select: 'u.*, bin_to_uuid(u.uid) as uid, s.sid', filters: {'sid': sid  }})
        }
        res.send({'data': data && data.length ? data : null})
    })


    // SUB SERVER CALL
    app.post('/syncs/users_profile_to_central', async (req, res) => {
        var sync_logs = {}
        if(result = fs.readFileSync('sync_logs')) sync_logs = JSON.parse(result)
        var sid = sync_logs.profile != undefined ? sync_logs.profile : 0       
        const data = await userModel.getUserSync({select: 'bin_to_uuid(u.uid) as uid, u.password, u.phone, u.sex, u.name, u.email, u.updated_at, s.sid' , filters: {'sid': sid}})     
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
    // CENTRAL
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


    // CENTRAL
    app.post('/syncs/ports_to_sub', async (req, res) => {
        var data = []
        if(req.body.sid != undefined) {
          var sid = req.body.sid
          data = await portModel.sync({select: 'p.*, bin_to_uuid(p.id) as id, s.sid', filters: {'sid': sid }}) 
        }
        res.send({'data': data && data.length ? data : null})
    })
    // SUB SERVER CALL
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
                    }
                    else {
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


    // CENTRAL
    app.post('/syncs/visa_types_to_sub', async (req, res) => {
        var data = []
        if(req.body.sid != undefined) {
          var sid = req.body.sid
          data = await visaTypeModel.sync({select: 'vt.*, bin_to_uuid(vt.id) as id, s.sid', filters: {'sid': sid }}) 
        }
        res.send({'data': data && data.length ? data : null})
    })
    // SUB SERVER CALL
    app.post('/syncs/visa_types_from_central', async (req, res, next) => {
        var sync_logs = {}
        var request = null
        if(result = fs.readFileSync('sync_logs')) sync_logs = JSON.parse(result)
        var sid = sync_logs.visa_types != undefined ? sync_logs.visa_types : 0 
        try {
            request = await axios.post(config.centralUrl+'syncs/visa_types_to_sub', {'sid': parseInt(sid)})    
            if(request.data != null && request.data.data) {
                for(var i in request.data.data) {
                    var val = request.data.data[i]
                    // check record
                    if(sid<=val.sid) sid = val.sid
                    delete val.sid
                    const visaType = await visaTypeModel.getOne({select: '*', filters: {'id': val.id}})
                    if(visaType) {
                        await visaTypeModel.updateSync(request.data.data[i])
                    } else {
                        await visaTypeModel.addSync(request.data.data[i])
                    }
                }
            }
            sync_logs.visa_types = sid
            fs.writeFileSync('sync_logs', JSON.stringify(sync_logs))
            res.send({'id':sid})
                
        } catch (error) {
            next() 
        }
    })


    // CENTRAL
    app.post('/syncs/countries_to_sub', async (req, res) => {
        var data = []
        if(req.body.sid != undefined) {
          var sid = req.body.sid
          data = await countryModel.sync({select: 'c.*, bin_to_uuid(c.id) as id, s.sid', filters: {'sid': sid }}) 
        }
        res.send({'data': data && data.length ? data : null})
    })
    // SUB SERVER CALL
    app.post('/syncs/countries_from_central', async (req, res, next) => {
        var sync_logs = {}
        if(result = fs.readFileSync('sync_logs')) sync_logs = JSON.parse(result)
        var sid = sync_logs.countries != undefined ? sync_logs.countries : 0

        try {
            const request = await axios.post(config.centralUrl+'syncs/countries_to_sub', {'sid': parseInt(sid)})    
            if(request.data != null && request.data.data) {
                for(var i in request.data.data) {
                    var val = request.data.data[i]
                    if(sid<=val.sid) sid = val.sid
                    delete val.sid
                    const country = await countryModel.getOne({select: '*', filters: {'id': val.id}})
                    if(country) {
                        await countryModel.updateSync(request.data.data[i])
                    } else {
                        await countryModel.addSync(request.data.data[i])
                    }
                }
            }
            sync_logs.countries = sid
            fs.writeFileSync('sync_logs', JSON.stringify(sync_logs))
            res.send({'id':sid})   
        } catch (error) {
            next()
        }        
    })


    // CENTRAL
    app.post('/syncs/activity_logs_from_sub', async (req, res) => {
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
    // SUB SERVER CALL
    app.post('/syncs/activity_logs_to_central', async (req, res) => {
        const data = await activityLogModel.getActivitySync({select: 'a.*, bin_to_uuid(a.id) as id, bin_to_uuid(a.uid) as uid, bin_to_uuid(a.record_id) as record_id', filters: {'sid': '0'}})        
        try {
            const result = await axios.post(config.centralUrl+'syncs/activity_logs_from_sub', { 'data': data })
            if(result && result.status==200){
                await activityLogSyncModel.delete()
                return res.send({'message': 'sync success'})
            }
        } catch (error) {
            // console.log('sync error')
        }
        return res.status(200).send({'message': 'Nothing update'})
    })

    // Checklists
    // CENTRAL
    app.post('/syncs/checklists_from_sub', async (req, res) => {
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
    // SUB SERVER CALL 
    app.post('/syncs/checklists_to_central', async (req, res) => {
        const data = await checklistModel.getChecklistSync({select: 'c.*, bin_to_uuid(c.id) as id, bin_to_uuid(c.uid) as uid',  filters: {'sid': '0'}})   
        try {
            const result = await axios.post(config.centralUrl+'syncs/checklists_from_sub', { 'data': data })
            if(result && result.status==200){
                await checklistSyncModel.delete()
                return res.send({'message': 'sync success'})
            }
        } catch (error) {
            // console.log('sync error')
        }
        return res.status(200).send({'message': 'Nothing update'})
    })


    // Passports
    // CENTRAL
    app.post('/syncs/passports_from_sub', async (req, res) => {
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
    // SUB SERVER CALL
    app.post('/syncs/passports_to_central', async (req, res) => {
        const data = await passportModel.getPassportSync({select: 'p.*, bin_to_uuid(p.pid) as pid, bin_to_uuid(p.vid) as vid, bin_to_uuid(p.uid) as uid',  filters: {'sid': '0'}})
        try {
            const result = await axios.post(config.centralUrl+'syncs/passports_from_sub', { 'data': data })
            if(result && result.status==200){
                await passportSyncModel.delete()
                return res.send({'message': 'sync success'})
            }
        } catch (error) {
            // console.log('sync error')
        }
        return res.status(200).send({'message': 'Nothing update'})
    })


    // Visas
    // CENTRAL 
    app.post('/syncs/visas_from_sub', async (req, res) => {
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
    // SUB SERVER CALL
    app.post('/syncs/visas_to_central', async (req, res, next) => {
        const data = await visaModel.getVisaSync({select: 'v.*, bin_to_uuid(v.vid) as vid, bin_to_uuid(v.uid) as uid',  filters: {'sid': '0'}})                   
        if(data && data.length ){
            // Upload To Central
            data.forEach(async val => {
                let attFiles = null
                if(val.attachments !=undefined ){
                    attFiles = JSON.parse(val.attachments)
                    if( attFiles !=undefined){
                        for (const [key, value] of Object.entries(attFiles)) {
                            const data = new FormData();
                            data.append('file', fs.createReadStream(config.uploadDir+value));
                            try {
                                const upload = await axios.post(config.centralUrl+'upload_sync', data, { headers: { 'attachments': value,  'accept': 'application/json', 'Accept-Language': 'en-US,en;q=0.8','Content-Type': `multipart/form-data; boundary=${data._boundary}`,}})  
                            } catch (error) {
                                //  
                            }          
                        }
                    }                  
               } 
            })

            // Send Data To Central
            try {
                const result = await axios.post(config.centralUrl+'syncs/visas_from_sub', { 'data': data })
                if(result && result.status==200){
                    await visaSyncModel.delete()
                    return res.send({'message': 'sync success'})
                }
            } catch (error) {
                // console.log('sync error')
            }
        }
        return res.status(200).send({'message': 'Nothing update'})
    })


    // Visas Printed
    // CENTRAL 
    app.post('/syncs/printed_visas_from_sub', async (req, res) => {
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
    // SUB SERVER CALL
    app.post('/syncs/printed_visas_to_central', async (req, res) => {
        const data = await printedVisasModel.getVisasSync({select: 'pv.*, bin_to_uuid(pv.id) as id, bin_to_uuid(pv.vid) as vid, bin_to_uuid(pv.uid) as uid',  filters: {'sid': '0'}})           
        if(data && data.length ){
            try {
            const result = await axios.post(config.centralUrl+'syncs/printed_visas_from_sub', { 'data': data })
            if(result && result.status==200){
                await printedVisasSyncModel.delete()
                return res.send({'message': 'sync success'})
            }
        } catch (error) {
            // console.log('sync error')
        }}
        return res.status(200).send({'message': 'Nothing update'})
    })


    // Visas Deleted
    // CENTRAL 
    app.post('/syncs/deleted_visas_from_sub', async (req, res) => {
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
    // SUB SERVER CALL
    app.post('/syncs/deleted_visas_to_central', async (req, res) => {
        const data = await deletedVisasModel.getVisasSync({select: 'dv.*, bin_to_uuid(dv.id) as id, bin_to_uuid(dv.vid) as vid, bin_to_uuid(dv.uid) as uid',  filters: {'sid': '0'}})        
        if(data && data.length ){   
            // Upload To Central
            data.forEach(async val => {
                let attFiles = null
                if(val.attachments !=undefined ){
                    attFiles = JSON.parse(val.attachments)
                    if( attFiles !=undefined){
                        for (const [key, value] of Object.entries(attFiles)) {
                            const data = new FormData();
                            data.append('file', fs.createReadStream(config.uploadDir+value));
                            try {
                                const upload = await axios.post(config.centralUrl+'upload_sync', data, { headers: { 'attachments': value,  'accept': 'application/json', 'Accept-Language': 'en-US,en;q=0.8','Content-Type': `multipart/form-data; boundary=${data._boundary}`,}})  
                            } catch (error) {
                                //  
                            }          
                        }
                    }                  
                } 
            })
            try {
                const result = await axios.post(config.centralUrl+'syncs/deleted_visas_from_sub', { 'data': data })
                if(result && result.status==200){
                    await deletedVisasSyncModel.delete()
                    return res.send({'message': 'sync success'})
                }
            } catch (error) {
                // console.log('sync error')
            }
        }
        return res.status(200).send({'message': 'Nothing update'})
    })


    // Sync Data
    app.get('/syncs/sync_data', async (req, res) => {
        const URL =  config.baseUrl

        // console.log(`Last sync: ${generalLib.formatDateTime(generalLib.dateTime())}`)

        axios.post(URL+'syncs/users_from_central', {})
        .then(function (response) {
        // console.log(response);
        })
        .catch(function (error) {
        console.log(error);
        });

        axios.post(URL+'syncs/users_profile_to_central', {})
        .then(function (response) {
        // console.log(response);
        })
        .catch(function (error) {
        console.log(error);
        });

        axios.post(URL+'syncs/ports_from_central', {})
        .then(function (response) {
        // console.log(response);
        })
        .catch(function (error) {
        console.log(error);
        });
        axios.post(URL+'syncs/visa_types_from_central', {})
        .then(function (response) {
        // console.log(response);
        })
        .catch(function (error) {
        console.log(error);
        });
        axios.post(URL+'syncs/countries_from_central', {})
        .then(function (response) {
        // console.log(response);
        })
        .catch(function (error) {
        console.log(error);
        });
        axios.post(URL+'syncs/activity_logs_to_central', {})
        .then(function (response) {
        // console.log(response);
        })
        .catch(function (error) {
        console.log(error);
        });
        axios.post(URL+'syncs/checklists_to_central', {})
        .then(function (response) {
        // console.log(response);
        })
        .catch(function (error) {
        console.log(error);
        });
        axios.post(URL+'syncs/passports_to_central', {})
        .then(function (response) {
        // console.log(response);
        })
        .catch(function (error) {
        console.log(error);
        });
        axios.post(URL+'syncs/visas_to_central', {})
        
        .then(function (response) {
        // console.log(response);
        })
        .catch(function (error) {
        console.log(error);
        });
        axios.post(URL+'syncs/printed_visas_to_central', {})
        .then(function (response) {
        // console.log(response);
        })
        .catch(function (error) {
        console.log(error);
        });
        axios.post(URL+'syncs/deleted_visas_to_central', {})
        .then(function (response) {
        // console.log(response);
        })
        .catch(function (error) {
        console.log(error);
        });

    })

}