var perms = {}

perms.UserTypes = {

}

perms.AuthLevel = function(userlevel) {
    switch(userlevel) {
        case "root": 
            return 3;
        case "admin":
            return 2
        case "user":
            return 1
        default:
            return -1
    }
}

module.exports = perms