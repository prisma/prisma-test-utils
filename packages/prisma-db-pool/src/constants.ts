export const prismaConfig = `
prototype: true
databases:
 default:
   connector: sqlite-native
   databaseFile: ./db/migration_engine.db
   migrations: true
   active: true
   rawAccess: true
`
