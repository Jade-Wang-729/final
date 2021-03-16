var express = require('express')
var mysql = require('mysql')
var bodyParser = require('body-parser')
var xlsx = require('node-xlsx')
var fs = require('fs')
var web = express()

web.engine('html', require('express-art-template'))
web.use(bodyParser.urlencoded({extended: false}))
web.use(bodyParser.json())

var session = require('express-session')
web.use(session({
    secret: 'qweqweqweqwe', // 建议使用 128 个字符的随机字符串
    cookie: { maxAge: 20 * 60 * 1000 }, //cookie生存周期20*60秒
    resave: true,  //cookie之间的请求规则,假设每次登陆，就算会话存在也重新保存一次
    saveUninitialized: true //强制保存未初始化的会话到存储器
}));  //这些是写在app.js里面的

web.use('/public/', express.static('./public/'))

web.get('/login', function(req, res){
    res.render('login.html')
})

web.get('/expire', function(req, res){
    res.render('sessionExpire.html')
})

web.get('/pwError', function(req, res){
    res.render('passwordError.html')
})

web.post('/login', function(req, res){
    var user = req.body
    req.session.uname = user.uname
    var queryLogin = 'SELECT `password`, `userType` FROM `LoginInfo` WHERE `username`="'+user.uname+'"'
    var connection = mysql.createConnection({
        host: 'localhost',
        user: 'username',
        password: 'password',
        database: 'feedbackSystem'
    })
    connection.connect()

    connection.query(queryLogin, function (error, loginInfo) {
        if (error) {
            console.log(error)
        }
        if (loginInfo.length === 0) {
            res.redirect('/pwError')
        }
        else if (loginInfo[0].password === user.upassword) {
            if (loginInfo[0].userType === "lecturer")
            res.redirect('/')
        }
        else {
            res.redirect('/pwError')
        }
    })
    connection.end()
})

web.get('/', function(req, res){
    if (req.session.uname) {
        var uname = req.session.uname
    } else {
        res.redirect('/expire')
    }
    var querySelect = 'SELECT * FROM Module'
    var connection = mysql.createConnection({
        host: 'localhost',
        user: 'username',
        password: 'password',
        database: 'feedbackSystem'
    })
    connection.connect()
    connection.query(querySelect, function (error, allMod) {
        if (error) {
            console.log(error)
        }
        req.session.allModules = allMod
        var allModules = req.session.allModules
        var html = [
            "Sorry lecturer, you haven't registered a module",
            "Please go to ",
            "Admin page ",
            "to create your module"
            ]
        if (allModules.length ===0){
            res.render('index.html', {
                html: html,
                modules: allModules,
                uname: uname
            })
        } else {
            res.render('index.html', {
                html: '',
                modules: allModules,
                uname: uname
            })
        }
    })
    // connection.end()
})

web.get('/module', function(req, res){
    if (req.session.uname) {
        var uname = req.session.uname
        var allModule = req.session.allModules
    } else {
        res.redirect('/login')
    }
    var reqObj = req.query
    req.session.moduleID = reqObj.moduleID
    var selectedModuleID = req.session.moduleID

    // query the information of the selected module
    var querySelectCurrentModule = 'SELECT * FROM Module WHERE `moduleCode`="'+selectedModuleID+'"'

    // query the data used in student table
    var queryStudentAverageScore = 'SELECT studentSPR, AVG(score) avgScore FROM `StudentFeedback` ' +
        'WHERE moduleCode = "'+selectedModuleID+'" GROUP BY studentSPR'
    var queryStudentLastScore = 'SELECT studentSPR, score lastScore FROM StudentFeedback ' +
        'WHERE `moduleCode`="'+selectedModuleID+'" and (studentSPR, weekNumber) IN ' +
        '(SELECT studentSPR, MAX(weekNumber) FROM StudentFeedback WHERE `moduleCode`="'+selectedModuleID+'" GROUP BY studentSPR)'
    var queryStudentTeamProject = 'SELECT * FROM `ModStuTe` JOIN `Student` ON ModStuTe.studentSPR=Student.studentSPR ' +
        'JOIN `ProjectInfo` ON (ModStuTe.teamNumber=ProjectInfo.teamNumber and ModStuTe.moduleCode=ProjectInfo.moduleCode) '
    var queryAllStudentTable = queryStudentTeamProject +
        'JOIN ('+queryStudentAverageScore+') AS stuAvgScore ON (ModStuTe.studentSPR=stuAvgScore.studentSPR)' +
        'JOIN ('+queryStudentLastScore+') AS stuLastScore ON (ModStuTe.studentSPR=stuLastScore.studentSPR)' +
        'WHERE ModStuTe.moduleCode="'+selectedModuleID+'"'

    // query the data used in group table
    var queryTeamMembers = 'SELECT ModStuTe.teamNumber, group_concat(Student.surname, " ", Student.forename Separator ", ") studentName ' +
        'FROM `ModStuTe` JOIN `Student` ON ModStuTe.studentSPR=Student.studentSPR GROUP BY ModStuTe.teamNumber '
    var queryGroupAverageScore = 'SELECT teamNumber, AVG(score) avgScore FROM `TeamFeedback` ' +
        'WHERE moduleCode = "'+selectedModuleID+'" GROUP BY teamNumber '
    var queryGroupLastScore = 'SELECT teamNumber, score lastScore FROM TeamFeedback ' +
        'WHERE `moduleCode`="'+selectedModuleID+'" and (teamNumber, weekNumber) IN ' +
        '(SELECT teamNumber, MAX(weekNumber) FROM TeamFeedback WHERE `moduleCode`="'+selectedModuleID+'" GROUP BY teamNumber) '
    var queryGroupProjectTA='SELECT * FROM `ModTeTA` ' +
        'JOIN `ProjectInfo` ON (ModTeTA.teamNumber=ProjectInfo.teamNumber and ModTeTA.moduleCode=ProjectInfo.moduleCode) ' +
        'JOIN `TA` ON (ModTeTA.taStudentSPR=TA.taStudentSPR) '
    var queryAllGroupTable = queryGroupProjectTA +
        ' JOIN (' + queryTeamMembers + ') AS TeamMembers ON (ModTeTA.teamNumber=TeamMembers.teamNumber) '+
        'JOIN ('+queryGroupAverageScore+') AS gAvgScore ON (ModTeTA.teamNumber=gAvgScore.teamNumber) ' +
        'JOIN ('+queryGroupLastScore+') AS gLastScore ON (ModTeTA.teamNumber=gLastScore.teamNumber) ' +
        'WHERE ModTeTA.moduleCode="'+selectedModuleID+'" '

    // query the data used in student need attention table
    var queryAttStudentTable = queryStudentTeamProject +
        'JOIN ('+queryStudentAverageScore+') AS stuAvgScore ON (ModStuTe.studentSPR=stuAvgScore.studentSPR)' +
        'JOIN ('+queryStudentLastScore+') AS stuLastScore ON (ModStuTe.studentSPR=stuLastScore.studentSPR)' +
        'WHERE ModStuTe.moduleCode="'+selectedModuleID+'" and stuLastScore.lastScore < 5'

    // query the data used in group need attention table
    var queryAttGroupTable = queryGroupProjectTA +
        ' JOIN (' + queryTeamMembers + ') AS TeamMembers ON (ModTeTA.teamNumber=TeamMembers.teamNumber) '+
        'JOIN ('+queryGroupAverageScore+') AS gAvgScore ON (ModTeTA.teamNumber=gAvgScore.teamNumber) ' +
        'JOIN ('+queryGroupLastScore+') AS gLastScore ON (ModTeTA.teamNumber=gLastScore.teamNumber) ' +
        'WHERE ModTeTA.moduleCode="'+selectedModuleID+'" and gLastScore.lastScore < 4.1 '

    var connection = mysql.createConnection({
        host: 'localhost',
        user: 'username',
        password: 'password',
        database: 'feedbackSystem'
    })
    connection.connect()

    connection.query(querySelectCurrentModule, function (error, currentModule) {
        if (error) {
            console.log(error)
        }
        connection.query(queryAllStudentTable, function (error, allStuInfo) {
            if (error) {
                console.log(error)
            }
            connection.query(queryAllGroupTable, function (error, allGroupInfo) {
                if (error) {
                    console.log(error)
                }
                connection.query(queryAttStudentTable, function (error, attStuInfo) {
                    if (error) {
                        console.log(error)
                    }
                    connection.query(queryAttGroupTable, function (error, attGroupInfo) {
                        if (error) {
                            console.log(error)
                        }
                        // console.log(attGroupInfo)
                        res.render('module.html', {
                            uname: uname,
                            modules: allModule,
                            module: currentModule[0],
                            allStudents: allStuInfo,
                            allGroups: allGroupInfo,
                            attStudents: attStuInfo,
                            attGroups: attGroupInfo
                        })
                    })
                })
            })
        })
    })
    // connection.end()
})

web.get('/group', function(req, res){
    if (req.session.uname) {
        var uname = req.session.uname
        var allModules = req.session.allModules
    } else {
        res.redirect('/login')
    }

    var reqObj = req.query
    req.session.teamNumber = reqObj.teamNumber
    var teamNumber = req.session.teamNumber
    var selectedModuleID = req.session.moduleID

    // query the information of the selected module
    var querySelectCurrentModule = 'SELECT * FROM Module WHERE `moduleCode`="'+selectedModuleID+'"'

    // query team members
    var queryTeamSepMembers = 'SELECT Student.surname, Student.forename, ModStuTe.memberIndex FROM `Student` JOIN `ModStuTe` ' +
        'ON ModStuTe.studentSPR=Student.studentSPR ' +
        'WHERE ModStuTe.teamNumber="' + teamNumber + '" AND `moduleCode`="'+selectedModuleID+'" '

    var queryTeamMembers = 'SELECT ModStuTe.teamNumber, group_concat(Student.surname, " ", Student.forename Separator ", ") studentName ' +
        'FROM `ModStuTe` JOIN `Student` ON ModStuTe.studentSPR=Student.studentSPR GROUP BY ModStuTe.teamNumber '
    var queryGroupAverageScore = 'SELECT teamNumber, AVG(score) avgScore FROM `TeamFeedback` ' +
        'WHERE moduleCode = "'+selectedModuleID+'" GROUP BY teamNumber '
    var queryGroupLastScore = 'SELECT teamNumber, score lastScore FROM TeamFeedback ' +
        'WHERE `moduleCode`="'+selectedModuleID+'" and (teamNumber, weekNumber) IN ' +
        '(SELECT teamNumber, MAX(weekNumber) FROM TeamFeedback WHERE `moduleCode`="'+selectedModuleID+'" GROUP BY teamNumber) '
    var queryGroupProjectTA='SELECT * FROM `ModTeTA` ' +
        'JOIN `ProjectInfo` ON (ModTeTA.teamNumber=ProjectInfo.teamNumber and ModTeTA.moduleCode=ProjectInfo.moduleCode) ' +
        'JOIN `TA` ON (ModTeTA.taStudentSPR=TA.taStudentSPR) '
    var queryAllGroupTable = queryGroupProjectTA +
        ' JOIN (' + queryTeamMembers + ') AS TeamMembers ON (ModTeTA.teamNumber=TeamMembers.teamNumber) '+
        'JOIN ('+queryGroupAverageScore+') AS gAvgScore ON (ModTeTA.teamNumber=gAvgScore.teamNumber) ' +
        'JOIN ('+queryGroupLastScore+') AS gLastScore ON (ModTeTA.teamNumber=gLastScore.teamNumber) ' +
        'WHERE ModTeTA.moduleCode="'+selectedModuleID+'" '

    var connection = mysql.createConnection({
        host: 'localhost',
        user: 'username',
        password: 'password',
        database: 'feedbackSystem'
    })
    connection.connect()
    connection.query(querySelectCurrentModule, function (error, currentModule) {
        if (error) {
            console.log(error)
        }
        connection.query(queryTeamSepMembers, function (error, teamMembers) {
            if (error) {
                console.log(error)
            }
            console.log(teamMembers)
            res.render('group.html', {
                uname: uname,
                modules: allModules,
                module: currentModule[0],
                member: teamMembers,

                // group: group[0],
                // feedback: feedback
            })
        })
    })
})

web.get('/student', function(req, res){
    if (req.session.uname) {
        var uname = req.session.uname
        var allModules = req.session.allModules
    } else {
        res.redirect('/login')
    }

    var reqObj = req.query
    req.session.studentID = reqObj.studentID
    var studentSPR = req.session.studentID
    var selectedModuleID = req.session.moduleID

    // query the information of the selected module
    var querySelectCurrentModule = 'SELECT * FROM Module WHERE `moduleCode`="'+selectedModuleID+'"'

    // query the information of the selected student
    var queryStudentAverageScore = 'SELECT studentSPR, AVG(score) avgScore FROM `StudentFeedback` ' +
        'WHERE moduleCode = "'+selectedModuleID+'" GROUP BY studentSPR'
    var queryStudentTeamProject = 'SELECT * FROM `ModStuTe` JOIN `Student` ON ModStuTe.studentSPR=Student.studentSPR ' +
        'JOIN `ProjectInfo` ON (ModStuTe.teamNumber=ProjectInfo.teamNumber and ModStuTe.moduleCode=ProjectInfo.moduleCode) '
    var querySelectStudent = queryStudentTeamProject +
        'JOIN ('+queryStudentAverageScore+') AS stuAvgScore ON (ModStuTe.studentSPR=stuAvgScore.studentSPR) ' +
        'WHERE ModStuTe.moduleCode="'+selectedModuleID+'" AND ModStuTe.studentSPR="'+studentSPR+'"'

    // query the feedback of the selected student
    var queryStudentFeedback = 'SELECT * FROM studentFeedback WHERE studentSPR="'+studentSPR+'" AND moduleCode="'+selectedModuleID+'"'

    var connection = mysql.createConnection({
        host: 'localhost',
        user: 'username',
        password: 'password',
        database: 'feedbackSystem'
    })
    connection.connect()
    connection.query(querySelectCurrentModule, function (error, currentModule) {
        if (error) {
            console.log(error)
        }
        connection.query(querySelectStudent, function (error, student) {
            if (error) {
                console.log(error)
            }
            connection.query(queryStudentFeedback, function (error, feedback) {
                if (error) {
                    console.log(error)
                }
                // console.log("********************")
                // console.log(uname)
                // console.log(allModules)
                // console.log(currentModule[0])
                // console.log(feedback)
                // console.log(student)
                // console.log("********************")
                res.render('student.html', {
                    uname: uname,
                    modules: allModules,
                    module: currentModule[0],
                    student: student[0],
                    feedback: feedback
                })
            })
        })
    })
})

web.post('/addModule', function(req, res){
    if (req.session.uname) {
        var uname = req.session.uname
    } else {
        res.redirect('/login')
    }
    var add = req.body

    var groupPath = "./table/"+add.groupingTable
    var groupingSheetList = xlsx.parse(groupPath)
    var groupingData = groupingSheetList[0].data

    //calculate how many members in one team and the members' columns in the table
    var groupingHeader = groupingData[0]
    var membersInTeam = 0
    var indexArray = []
    for (var n = 0; n < groupingHeader.length; n++) {
        if (groupingHeader[n].indexOf("member") != -1) {
            indexArray[membersInTeam] = n
            membersInTeam += 1
        }
    }
    console.log(groupingData.length)
    console.log(groupingData)


    var connection = mysql.createConnection({
        host: 'localhost',
        user: 'username',
        password: 'password',
        database: 'feedbackSystem'
    })
    connection.connect()

    // Insert into ModStuTe table
    for (var i = 1; i < groupingData.length; i++) {
        for (var j = 0; j < membersInTeam; j++) {
            var queryInsertModStuTe = 'INSERT INTO `ModStuTe`(`studentSPR`, `moduleCode`, `teamNumber`, `memberIndex`) ' +
                'VALUES ("'+groupingData[i][indexArray[j]]+'", "'+add.modID+'", "'+groupingData[i][0]+'", "'+(j+1)+'")'
            connection.query(queryInsertModStuTe, function (error, results) {
                if (error) {
                    console.log(error)
                }
            })
        }
    }

    // Insert into ModTeTA table
    for (i = 1; i < groupingData.length; i++) {
        var queryInsertModTeTA = 'INSERT INTO `ModTeTA`(`moduleCode`, `teamNumber`, `taStudentSPR`) ' +
            'VALUES ("'+add.modID+'", "'+groupingData[i][0]+'", "'+groupingData[i][3]+'")'
        connection.query(queryInsertModTeTA, function (error, results) {
            if (error) {
                console.log(error)
            }
        })
    }

    // Insert into ProjectInfo table
    for (i = 1; i < groupingData.length; i++) {
        var queryInsertProjectInfo = 'INSERT INTO `ProjectInfo`(`moduleCode`, `teamNumber`, `labCode`, `projectTitle`, `projectBrief`) ' +
            'VALUES ("'+add.modID+'", "'+groupingData[i][0]+'","" , "'+groupingData[i][1]+'", "'+groupingData[i][2]+'")'
        connection.query(queryInsertProjectInfo, function (error, results) {
            if (error) {
                console.log(error)
            }
        })
    }

    // Insert into Module table
    var queryInsertModule = 'INSERT INTO `Module`(`moduleCode`, `moduleName`, `moduleDescription`, `modulePlan`, `employeeID`) ' +
        'VALUES ("'+add.modID+'", "'+add.modName+'", "'+add.modDes+'", "'+add.modPlan+'", "'+uname+'")'
    connection.query(queryInsertModule, function (error, results) {
        if (error) {
            console.log(error)
        }
    })
    // connection.end()
    res.redirect('/')
})

web.post('/modifyModule', function(req, res){
    if (req.session.uname) {
        var uname = req.session.uname
    } else {
        res.redirect('/login')
    }
    var modify = req.body
    // var stuPath = "./table/"+modify.stuTable
    // var groupPath = "./table/"+modify.groupTable
    //
    // var stuSheetList = xlsx.parse(stuPath)
    // var stuData = stuSheetList[0].data
    // var groupSheetList = xlsx.parse(groupPath)
    // var groupData = groupSheetList[0].data

    var connection = mysql.createConnection({
        host: 'localhost',
        user: 'username',
        password: 'password',
        database: 'traffic_feedback_system'
    })
    connection.connect()

    // for (var i = 1; i < stuData.length; i++) {
    //     var queryInsertStu = 'UPDATE `student` SET `ID`="'+stuData[i][0]+'" `Name`="'+stuData[i][1]+'" `Role`="'+stuData[i][2]+
    //         '" `Department`="'+stuData[i][3]+'" `Email`="'+stuData[i][4]+'" `Phone`="'+stuData[i][5]+'" `Module`="'+modify.modID+
    //         '" `Group`="'+stuData[i][7]+' `Project`="'+stuData[i][8]+'" `Feedback1`="'+stuData[i][9]+'" `Feedback2`="'+stuData[i][10]+
    //         '" `Feedback3`="'+stuData[i][11]+'" `Feedback4`="'+stuData[i][12]+'" `Feedback5`="'+stuData[i][13]+
    //         '" WHERE `moduleID`="'+modify.modID+'" and `teamNumber`="' + groupData[i][1]+'"'
    //     connection.query(queryInsertStu, function (error, results) {
    //         if (error) {
    //             console.log(error)
    //         }
    //     })
    // }
    //
    // for (var j = 1; j < groupData.length; j++) {
    //     var queryInsertGroup = 'UPDATE `grouping` SET `Project`="'+ groupData[j][2]+
    //         '" `tm1`="'+groupData[j][3]+'" `tm2`"'+groupData[j][4]+'" `tm3`="'+groupData[j][5]+'" `Feedback1`="'+groupData[j][6]+
    //         '" `Feedback2`="'+groupData[j][7]+'" `Feedback3`="'+groupData[j][8]+'" `Feedback4`="'+groupData[j][9]+
    //         '" `Feedback5`="'+groupData[j][10]+'" WHERE `moduleID`="'+modify.modID+'" and `teamNumber`="'+groupData[j][1]+'"'
    //     connection.query(queryInsertGroup, function (error, results) {
    //         if (error) {
    //             console.log(error)
    //         }
    //     })
    // }

    var queryInsert = 'UPDATE `module` SET `description`="'+modify.modDes+' `plan`="'+modify.modPlan+'" WHERE `moduleID`="'+modify.modID+'"'
    connection.query(queryInsert, function (error, results) {
        if (error) {
            console.log(error)
        }
    })
    connection.end()
    res.redirect('/')
})

web.get('/admin', function(req, res){
    if (req.session.uname) {
        var uname = req.session.uname
        var allModules = req.session.allModules
    } else {
        res.redirect('/login')
    }
    var connection = mysql.createConnection({
        host: 'localhost',
        user: 'username',
        password: 'password',
        database: 'traffic_feedback_system'
    })
    connection.connect()
    res.render('admin.html', {
        modules: allModules,
        uname: uname
    })
    connection.end()
})

web.listen(3000, function () {
    console.log('server starts successfully.')
})