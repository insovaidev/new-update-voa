const alsLib = require('../libraries/alsLib')
const generalLib = require('../libraries/generalLib')
const checkAuth = require('../middleware/checkAuth')
const { check, validationResult } = require('express-validator')
const checklistModel = require('../models/checklistModel')
const countryModel = require('../models/countryModel')
const lang = require('../language/en.json')
const userModel = require('../models/userModel')
const config = require('../config/config')
const fileLib = require('../libraries/fileLib')
const portModel = require('../models/portModel')


module.exports = function(app) {

    // Apply authentication
    app.use('/checklists', checkAuth)

    // Check ALS
    app.post('/checklists/check',[
        check('passport_no').notEmpty().isLength({min: 6, max: 15}).trim().escape(),
        check('surname').notEmpty().trim().escape(),
        check('given_name').notEmpty().trim().escape(),
        check('sex').notEmpty().isIn(['f','m']).trim().escape(),

        // check dob
        check('dob', 'Date must between '+generalLib.date({minusYear: 120, format: 'DD-MM-YYYY'})+' and '+generalLib.date({format: 'DD-MM-YYYY'}))
        .notEmpty().trim().isDate().escape()
        .isAfter(generalLib.date({minusYear: 120})).withMessage('Date must be greater than '+generalLib.date({minusYear: 121, format: 'DD-MM-YYYY'}))
        .isBefore(generalLib.date({addDay: 1})).withMessage('Date must be lower than '+generalLib.date({addDay: 1, format: 'DD-MM-YYYY'})),

        check('nationality').notEmpty().isLength({min: 3, max: 3}).trim().escape(),

        // check expired date
        check('expire_date').notEmpty().trim().isDate().isAfter(generalLib.date({addDay: 180})).withMessage(val => {
            if(parseInt(val.replaceAll('-','')) < parseInt(generalLib.date().replaceAll('-',''))) return lang.passportExpired
            return lang.passportNearlyExpired
        }).escape(),

        // check issued date
        check('issued_date').custom(async (value, { req }) => {
            if(value) {
                await check('issued_date', 'Date must between '+generalLib.date({minusYear: 120, format: 'DD-MM-YYYY'})+' and '+generalLib.date({format: 'DD-MM-YYYY'})).notEmpty().trim().isDate().escape()
                .isAfter(generalLib.date({minusYear: 120})).withMessage('Date must be greater than '+generalLib.date({minusYear: 121, format: 'DD-MM-YYYY'}))
                .isBefore(generalLib.date({addDay: 1})).withMessage('Date must be lower than '+generalLib.date({addDay: 1, format: 'DD-MM-YYYY'}))
                .run(req)
            }
        }),
    ], async (req, res) => {
        // Check Form Errors
        const errors = validationResult(req)
        if (!errors.isEmpty()) return res.status(422).json(generalLib.formErrors(errors.array()))
        const body = req.body
        const attachments = req.body.attachments != undefined && req.body.attachments ? JSON.parse(req.body.attachments) : null  
        const timestamp = Math.floor(Date.now() / 1000)
        const me = req.me
       
        // Role and Permission
        if(me.role == 'super_admin' || me.role == 'admin' ||  me.role == 'report') return res.status(403).send({'message': `Role ${me.role} is not allowed to check blacklist.`}) 

        try {
            if(me.role == 'staff'){
                if(user = await userModel.get({ select: '*', filters: { uid: me.id } })) {
                    let perms=[]
                    if(!user.permissions) return res.status(403).send({'message':'Dont have permission to request data.'}) 
                    perms.push(...user.permissions.split(','));
                    if(!perms.includes('blacklist')) return res.status(403).send({'message':'Dont have permission to check blacklist.'})
                }
            } 
    
            // Poassport Data
            const data =  {
                "passport_no":body.passport_no.toUpperCase(),
                "surname": body.surname.toUpperCase(),
                "given_name": body.given_name.toUpperCase(),
                "sex": body.sex.toLowerCase(),
                "dob": body.dob,
                "expire_date": body.expire_date,
                "nationality": body.nationality.toUpperCase(),
                "issued_date": body.issued_date !=undefined && body.issued_date ? body.issued_date : null,
            }
    
            data.id = generalLib.generateUUID(me.port)
            data.passport_id = data.nationality+'-'+data.passport_no
            data.base_id = data.passport_id+'-'+me.port+'-'+timestamp
            data.uid = me.id
            data.port = me.port
            
            // Additional Fields
            var additionalField = Object.assign({}, {})
    
            // Attachments
            if(attachments) {
                additionalField.attachments = {}
                if(attachments.photo != undefined && attachments.photo) {
                    if (!fileLib.exist(config.tmpDir+attachments.photo)) return res.status(422).send({'message':'Photo file not found.'})
                    additionalField.attachments.photo = attachments.photo
                }  
                if(attachments.passport != undefined && attachments.passport) {
                    if (!fileLib.exist(config.tmpDir+attachments.passport)) return res.status(422).send({'message':'Passport file not found.'})
                    additionalField.attachments.passport = attachments.passport
                }
            }
    
            // Additional Fields Update
            if(additionalField){
                if((Object.values(additionalField).length) > 0 ) data.data = JSON.stringify(additionalField)
            }
    
            // Add Checklist Record
            await checklistModel.add(data)
    
            // Setup data for checking in ALS
            data.country_code = data.nationality
            data.sex = data.sex == 'm' ? 'male' : 'female'
            data.create_by_id = req.me.id
            data.create_by_username = req.me.username
            const dob = body.dob != undefined ? body.dob.split('-') : null
            data.dob_yyyy = dob[0]
            data.dob_mm = dob[1]
            data.dob_dd = dob[2]
            data.item_status = 2 // 1=three step, 2=quick form
    
            // Get nationality name
            if(country = await countryModel.get(data.country_code)) data.nationality = country.name
    
            const portData = await portModel.get(me.port, 'code')
    
            if(portData && portData.check_als=='1'){
                const result = await alsLib.checkAlerlist(data)
                // Update check result
                const updateState = {
                    'base_id': data.base_id ,
                    'match_als': result.status,
                    'status_code': result.status_code,
                    'als_message': result.message,
                    'als_response': result.response?JSON.stringify(result.response):null,
                }
                await checklistModel.update(data.id, updateState)
                // Response Data
                if(result.status == 'failed') return res.status(500).json({'code': result.status_code, 'type': 'check_blacklist', 'message': result.message})
                return res.send({
                    // 'id': data.id,
                    'status': result.status,
                    'state': 'completed',
                    'message': result.message
                })
            }
    
            // Update State for port that no need check blacklist
            const updateState = {
                'match_als': 3,
                'status_code': 1,
                'als_response': null
            }
            await checklistModel.update(data.id, updateState)
            return res.send({
                // 'id': data.id,
                'status': 0,
                'state': 'completed',
                'message': 'Not check with ALS.'
            })   
        } catch (error) {
            return res.status(422).send({'code': error.code , 'sql': error.sql, 'message': error.sqlMessage})
        }
    })

    // Get checklists
    app.get('/checklists', async(req, res) => {
        var total = 0
        var balcklist = 0
        var no_balcklist = 0
        var not_check_with_als = 0
        var data = null 
        var result = null
        var filters = Object.assign({},  req.query) 
        const me = req.me
        
        if(me.role == 'sub_admin' || me.role == 'report' || me.role == 'staff' ) return res.status(403).send({'message': `Role ${me.role} is not allowed to view checklist.`}) 
        
        if(me.port) filters.port = me.port

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

        try {
            if(result = await checklistModel.list({select: "bin_to_uuid(id) as id, bin_to_uuid(uid) as uid, passport_id, surname, given_name, match_als, sex, passport_no, port, nationality, issued_date, expire_date", filters: filters})){
                var checklist = []
                result.forEach(val => {
                    if(val.issued_date) val.issued_date = generalLib.formatDate(val.issued_date) 
                    if(val.expire_date) val.expire_date = generalLib.formatDate(val.expire_date) 
                    checklist.push({...val})
                });
                data = checklist
            }
    
            await Promise.all([
                checklistModel.total().then(result => {
                    if (result) total = result[0].total
                }),
                checklistModel.total({filters: {'match_als': '1'} }).then(result => {
                    if (result) balcklist = result[0].total
                }),
    
                checklistModel.total({filters: {'match_als': '0'} }).then(result => {
                    if (result) no_balcklist = result[0].total
                }),
    
                checklistModel.total({ filters: {'match_als': '3'} }).then(result => {
                    if (result) not_check_with_als = result[0].total
                }),
            ])
            const response = {
                'balcklist': balcklist,
                'no_balcklist': no_balcklist,
                'not_check_with_als': not_check_with_als
            }
            return res.send({ 'total': total, 'limit': 30, 'offset': parseInt(filters.offset),  'data': data , ...response })
        } catch (error) {
            return res.status(422).send({'code': error.code , 'sql': error.sql, 'message': error.sqlMessage})
        }
    })

    app.get('/checklists/:id', async(req, res) => {
        var data = null 
        var id = req.params.id  
        try {
            if(result = await checklistModel.get({select: "*, bin_to_uuid(id) as id, bin_to_uuid(uid) as uid",filters: {'id': id}})){
                data = result
                data.issued_date = generalLib.formatDate(result.issued_date)
                data.expire_date = generalLib.formatDate(result.expire_date)
                data.dob = generalLib.formatDate(result.dob)
                data.updated_at = generalLib.formatDateTime(result.updated_at)
                data.updated_at = generalLib.formatDateTime(result.updated_at)
                delete data.data 
            }
            return res.send({'data': data})
        } catch (error) {
            return res.status(422).send({'code': error.code , 'sql': error.sql, 'message': error.sqlMessage})
        }
    })
}
