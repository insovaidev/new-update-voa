const userModel = require("../models/userModel");

module.exports = function(app){

    app.post('/users/create', async (req, res) => {
        const body = req.body
        const userData = {
            'uid': body.uid,
            'name': body.name,
            'username': body.username,
            'sex': body.sex,
            'phone': body.phone,
            'email': body.email,
            'role': body.role,
            'permissions': body.permissions,
            'port': body.port,
            'photo': body.photo,
            'banned': body.banned,
            'banned_reason': body.banned_reason,
            'password':  body.password,
            'logined_at':  body.logined_at,
            'logout_at':  body.logout_at,
            'last_ip':  body.last_ip,
            'last_user_agent':  body.last_user_agent,
        }
        try {
            if(exist = await userModel.get({select:'username', filters: { 'username': body.username }})) return res.status(200).send({'status': 422, 'message': 'Username already exist.'})
            const add = await userModel.add(userData)
            const user =  await userModel.get({select: 'bin_to_uuid(uid) as uid,username, name, phone, sex, email, permissions, port, photo, banned, role, banned_reason, logined_at,logout_at,last_ip,	updated_at, created_at', filters: {'uid': userData.uid }})
            return res.status(200).send({'data': user })
        } catch (error) {
            return res.status(422).send({'code': error.code , 'sql': error.sql, 'sqlMessage': error.sqlMessage})
        }
    })

    app.post('/users/update/:id', async (req, res) => {
        const id = req.params.id
        const userData = req.body  
        try {
            if(await userModel.update(id, userData)){
                const user =  await userModel.get({select: 'bin_to_uuid(uid) as uid,username, name, phone, sex, email, permissions, port, photo, banned, role, banned_reason, logined_at,logout_at,last_ip,	updated_at, created_at', filters: {'uid': id }})
                return res.status(200).send({'data': user })
            }
        } catch (error) {
            return res.status(422).send({'code': error.code , 'sql': error.sql, 'sqlMessage': error.sqlMessage})
        }
    })
}