```prisma
generator client {
  provider = "prisma-client-js"
  output   = "./@generated/client"
}

generator testutils {
  provider = "./dist/generator.js"
  output   = "./@generated/prisma-test-utils"
}
```
