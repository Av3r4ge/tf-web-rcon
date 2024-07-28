var perms = {}

perms.AuthLevel = function(userlevel) {
    switch(userlevel) {
        case "root": 
            return 4;
        case "manager":
            return 3
        case "admin":
            return 2
        case "user":
            return 1
        default:
            return false
    }
}

module.exports = perms