var express = require("express");
var router = express.Router();
let { uploadImage, uploadExcel } = require('../utils/uploadHandler')
let exceljs = require('exceljs')
let path = require('path')
let fs = require('fs')
let mongoose = require('mongoose');
let productModel = require('../schemas/products')
let inventoryModel = require('../schemas/inventories')
let categoryModel = require('../schemas/categories')
let slugify = require('slugify')
let roleModel = require('../schemas/roles')
let userController = require('../controllers/users')
let { sendPasswordMail } = require('../utils/mailHandler')
let crypto = require('crypto')

router.post('/an_image', uploadImage.single('file')
    , function (req, res, next) {
        if (!req.file) {
            res.send({
                message: "file khong duoc rong"
            })
        } else {
            res.send({
                filename: req.file.filename,
                path: req.file.path,
                size: req.file.size
            })
        }
    })
router.get('/:filename', function (req, res, next) {
    let filename = path.join(__dirname, '../uploads', req.params.filename)
    res.sendFile(filename)
})

router.post('/multiple_images', uploadImage.array('files', 5)
    , function (req, res, next) {
        if (!req.files) {
            res.send({
                message: "file khong duoc rong"
            })
        } else {
            // res.send({
            //     filename: req.file.filename,
            //     path: req.file.path,
            //     size: req.file.size
            // })

            res.send(req.files.map(f => {
                return {
                    filename: f.filename,
                    path: f.path,
                    size: f.size
                }
            }))
        }
    })

router.post('/excel', uploadExcel.single('file')
    , async function (req, res, next) {
        if (!req.file) {
            res.send({
                message: "file khong duoc rong"
            })
        } else {
            //wookbook->worksheet->row/column->cell
            let workBook = new exceljs.Workbook()
            let filePath = path.join(__dirname, '../uploads', req.file.filename)
            await workBook.xlsx.readFile(filePath)
            let worksheet = workBook.worksheets[0];
            let result = [];

            let categoryMap = new Map();
            let categories = await categoryModel.find({
            })
            for (const category of categories) {
                categoryMap.set(category.name, category._id)
            }

            let products = await productModel.find({})
            let getTitle = products.map(
                p => p.title
            )
            let getSku = products.map(
                p => p.sku
            )

            for (let index = 2; index <= worksheet.rowCount; index++) {
                let errorsRow = [];
                const element = worksheet.getRow(index);
                let sku = element.getCell(1).value;
                let title = element.getCell(2).value;
                let category = element.getCell(3).value;
                let price = Number.parseInt(element.getCell(4).value);
                let stock = Number.parseInt(element.getCell(5).value);

                if (price < 0 || isNaN(price)) {
                    errorsRow.push("price khong duoc nho hon 0 va la so")
                }
                if (stock < 0 || isNaN(stock)) {
                    errorsRow.push("stock khong duoc nho hon 0 va la so")
                }
                if (!categoryMap.has(category)) {
                    errorsRow.push("category khong hop le")
                }
                if (getSku.includes(sku)) {
                    errorsRow.push("sku da ton tai")
                }
                if (getTitle.includes(title)) {
                    errorsRow.push("title da ton tai")
                }

                if (errorsRow.length > 0) {
                    result.push({
                        success: false,
                        data: errorsRow
                    })
                    continue;
                }
                let session = await mongoose.startSession()
                session.startTransaction()
                try {
                    let newProducts = new productModel({
                        sku: sku,
                        title: title,
                        slug: slugify(title, {
                            replacement: '-',
                            lower: false,
                            remove: undefined,
                        }),
                        description: title,
                        category: categoryMap.get(category),
                        price: price
                    })
                    await newProducts.save({ session })
                    let newInventory = new inventoryModel({
                        product: newProducts._id,
                        stock: stock
                    })
                    await newInventory.save({ session });
                    await newInventory.populate('product')
                    await session.commitTransaction();
                    await session.endSession()
                    getTitle.push(title);
                    getSku.push(sku)
                    result.push({
                        success: true,
                        data: newInventory
                    })
                } catch (error) {
                    await session.abortTransaction();
                    await session.endSession()
                    result.push({
                        success: false,
                        data: error.message
                    })
                }
            }
            fs.unlinkSync(filePath)
            result = result.map((r, index) => {
                if (r.success) {
                    return {
                        [index + 1]: r.data
                    }
                } else {
                    return {
                        [index + 1]: r.data.join(',')
                    }
                }
            })
            res.send(result)
        }

    })

function normalizeExcelCellValue(cellValue) {
    if (cellValue === null || cellValue === undefined) {
        return ''
    }

    if (typeof cellValue === 'string' || typeof cellValue === 'number' || typeof cellValue === 'boolean') {
        return String(cellValue).trim()
    }

    if (cellValue instanceof Date) {
        return cellValue.toISOString().trim()
    }

    if (typeof cellValue === 'object') {
        if (Array.isArray(cellValue.richText)) {
            return cellValue.richText.map(item => item.text || '').join('').trim()
        }

        if (cellValue.text) {
            return String(cellValue.text).trim()
        }

        if (cellValue.hyperlink) {
            return String(cellValue.hyperlink).trim()
        }

        if (cellValue.result !== undefined && cellValue.result !== null) {
            return String(cellValue.result).trim()
        }
    }

    return String(cellValue).trim()
}

router.post('/users', uploadExcel.single('file'), async function (req, res, next) {
    if (!req.file) {
        return res.status(400).send({ message: "file khong duoc rong" })
    }

    let filePath = path.join(__dirname, '../uploads', req.file.filename)
    let result = []

    try {
        // Find "user" role
        let userRole = await roleModel.findOne({ name: 'user', isDeleted: false })
        if (!userRole) {
            return res.status(400).send({ message: "Khong tim thay role 'user'" })
        }

        let workBook = new exceljs.Workbook()
        await workBook.xlsx.readFile(filePath)
        let worksheet = workBook.worksheets[0]

        for (let index = 2; index <= worksheet.rowCount; index++) {
            const row = worksheet.getRow(index)
            let username = normalizeExcelCellValue(row.getCell(1).value)
            let email = normalizeExcelCellValue(row.getCell(2).value).toLowerCase()

            if (!username || !email) {
                result.push({ [index - 1]: { success: false, error: "username va email khong duoc rong" } })
                continue
            }

            let isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
            if (!isValidEmail) {
                result.push({ [index - 1]: { success: false, error: "email khong hop le" } })
                continue
            }

            let existingByUsername = await userController.FindUserByUsername(username)
            if (existingByUsername) {
                result.push({ [index - 1]: { success: false, error: `username ${username} da ton tai` } })
                continue
            }

            let existingByEmail = await userController.FindUserByEmail(email)
            if (existingByEmail) {
                result.push({ [index - 1]: { success: false, error: `email ${email} da ton tai` } })
                continue
            }

            // Generate random 16-character password
            let password = crypto.randomBytes(12).toString('base64').slice(0, 16)

            try {
                let newUser = await userController.CreateAnUser(
                    username, password, email, userRole._id,
                    null, undefined, undefined, false, 0
                )
                await sendPasswordMail(email, username, password)
                result.push({ [index - 1]: { success: true, data: { username: newUser.username, email: newUser.email } } })
            } catch (err) {
                result.push({ [index - 1]: { success: false, error: err.message } })
            }
        }
    } finally {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath)
        }
    }

    res.send(result)
})

module.exports = router;