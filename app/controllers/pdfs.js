const puppeteer = require("puppeteer");
const fs = require('fs')
const checkAuth = require("../middleware/checkAuth");
const config = require('../config/config')
const visaTypeModel = require('../models/visaTypeModel')
const generateHtml = require('../libraries/generateHtml')
const countryModel = require('../models/countryModel')
const fileLib = require('../libraries/fileLib');
const deviceModel = require("../models/deviceModel");
const portModel = require("../models/portModel");


module.exports = function (app) {

    app.use('/pdfs', checkAuth)

    // Get PDF 
    app.post('/pdfs', async (req, res) => {
        const me = req.me
        const deviceId = req.headers['device-id'] != undefined && req.headers['device-id'] ? req.headers['device-id'] : null 
        const filters = Object.assign({}, req.query)
        if(me.port) filters.port = me.port
        try {
            const ports = await portModel.list({select: '*, bin_to_uuid(id) as id'})
            const portConfig = ports.reduce((obj, item) => {
                obj[item.code] = {
                    title: item.name_km,
                    status: item.code== 'PHN' ? "រាជធានី" : "ក្រុង"
                };
                obj['all'] = {"title": "ទាំងអស់", "status": "" }
                return obj;
            }, {});
            const dataPort = JSON.stringify(portConfig)
            const body = req.body
            const name = deviceId
            const htmlFilePath = config.pdfDir+name+'.html'
            const pdfFilePath = config.pdfDir+''+name+'.pdf'      
            
            const device = await deviceModel.get({select: 'port', filters: {'device_id': deviceId}})
            const deviceData = JSON.stringify(device)

            // Create Dir
            let dist = ""
            config.pdfDir.split('/').forEach(v => {
                if(v.indexOf(".") < 0) {
                    dist += "/"+v
                    if (!fs.existsSync("."+dist)) fs.mkdirSync("."+dist)
                }
            })

            // Write File
            if(filters){
                if(filters.report_by=='visa_type'){
                    const data = body
                    const visaType = await visaTypeModel.gets({select: 'bin_to_uuid(id) as id,price,ordering,popular,published,sort_reports,entries,type,duration,duration_type,label'})
                    const html = generateHtml.visaType({visaType: visaType, filters: filters, data: data, portConfig: dataPort, device: deviceData })      
                    fileLib.writeFile(htmlFilePath, html, true)    
                }
        
                if(filters.report_by=='nationality'){
                    const data = body
                    const visaType = await visaTypeModel.gets({select: 'bin_to_uuid(id) as id,price,ordering,popular,published,sort_reports,entries,type,duration,duration_type,label'})
                    const countries = await countryModel.gets()
                    const html = generateHtml.visaCounty({visaType: visaType, allCountry: countries, filters: filters, data: data, portConfig: dataPort, device: deviceData  })  
                    fileLib.writeFile(htmlFilePath, html, true)  
                }

                if(filters.report_by=='date'){
                    const data = body
                    const visaType = await visaTypeModel.gets({select: 'bin_to_uuid(id) as id,price,ordering,popular,published,sort_reports,entries,type,duration,duration_type,label'})
                    const html = generateHtml.visaDate({visaType: visaType, filters: filters, data: data , portConfig: dataPort, device: deviceData  }) 
                    fileLib.writeFile(htmlFilePath, html, true)   
                }
            }
                    
            // Launch the browser and open a new blank page
            const browser = await puppeteer.launch({
                headless: 'new' , 
                ignoreDefaultArgs: ['--disable-extensions'], // desible extention 
                args: ['--enable-gpu'], // spead up when headless: true
            });

            // Create a new page
            const page = await browser.newPage();

            page.setViewport({'width' : 1280, 'height' : 1024 });
        
            // URL 
            const website_url = `${config.baseUrl}reads?path=${htmlFilePath}`
            // Open URL in current page
            await page.goto(website_url); 
            // To reflect CSS used for screens instead of print
            await page.emulateMediaType('screen');
            // delete pdf exist
            fileLib.deleteFile(pdfFilePath)

            const createPDF = await page.pdf({
                path: pdfFilePath,
                margin: { top: '10px', right: '10px', bottom: '10px', left: '10px' },
                printBackground: true,
                format: 'A4',
                timeout: 0
            })

            // delete html avoid dubplicate
            if(createPDF ){
                if(fs.existsSync(htmlFilePath)){
                    fs.unlink(htmlFilePath, (err) => {
                        if (err) throw err;
                    });
                }
                // Close the browser instance
                await browser.close();
                return res.status(200).send({'url': config.baseUrl+pdfFilePath, 'path': pdfFilePath})
            }

        } catch (error) {
            console.log(error) 
            return res.status(422).send({'code': error.code , 'sql': error.sql, 'message': error.sqlMessage})   
        }
    })
}