const deviceModel = require("../models/deviceModel")
const generalLib = require("../libraries/generalLib")
const { check, validationResult } = require('express-validator')

module.exports = function(app) {

    // Add device
    app.post('/devices', [check('port').notEmpty().withMessage('port is require.').trim().escape(),check('device_id').notEmpty().withMessage('device_id is require.').trim().escape(),],async (req, res) => {
        const errors = validationResult(req)
        if (!errors.isEmpty()) return res.status(422).json(generalLib.formErrors(errors.array()))
        const body = req.body
      
        body.user_agent=req.headers['user-agent']
        body.ip=generalLib.getIp(req)
        body.status=1

        try {
            if(body.device_id && body.port ){
                const device = await deviceModel.get({filters: {'device_id': body.device_id}})
                if(device) {
                    await deviceModel.update(body.device_id, body,'device_id')
                    return res.send({'message': 'update success'})
                } 
                body.id=generalLib.generateUUID(body.port)
                await deviceModel.add(body)
                return res.send({'message': 'success'})
            }    
            return res.status(422).send({'message': 'Invalid request.'})
            
        } catch (error) {
            return res.status(422).send({'code': error.code , 'sql': error.sql, 'sqlMessage': error.sqlMessage})
        }

    })

    app.patch('/devices/:id', async(req, res)    => {
        res.status(401).send({'message': 'device not found.'})
    })
}


