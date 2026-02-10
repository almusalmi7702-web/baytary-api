const express = require('express');
const { ApolloServer, gql } = require('apollo-server-express');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');

// --- إعدادات التشفير (Secret Keys) ---
const JWT_SECRET = 'baytary-super-secret-key-2026'; // مفتاح التشفير
const ACCESS_TOKEN_EXPIRY = '1d'; // التوكن ينتهي بعد يوم
const REFRESH_TOKEN_EXPIRY = '7d'; // توكن التجديد ينتهي بعد أسبوع

// --- تحميل قاعدة البيانات ---
let db = require('./db.json');

// --- دوال مساعدة لتوليد التوكن الحقيقي ---
const generateTokens = (user) => {
  // هنا يتم "طبخ" التوكن الحقيقي الذي يبدأ بـ eyJ
  const access_token = jwt.sign(
    { sub: user.id, role: user.role }, 
    JWT_SECRET, 
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
  
  const refresh_token = jwt.sign(
    { sub: user.id }, 
    JWT_SECRET, 
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );

  return { access_token, refresh_token };
};

// --- تعريف المخطط العملاق (The Giant Schema) ---
const typeDefs = gql`
  # 1. تعريف الكائنات الأساسية (Types)
  type Category {
    id: ID!
    name: String
    image: String
  }

  type Product {
    id: ID!
    title: String
    price: Float
    description: String
    images: [String]
    category: Category
    categoryId: Int
  }

  type User {
    id: ID!
    name: String
    email: String
    password: String
    role: String
    avatar: String
  }

  type AuthPayload {
    access_token: String
    refresh_token: String
  }

  type File {
    filename: String
    mimetype: String
    encoding: String
    location: String
  }

  # 2. مدخلات البيانات (Inputs) - لإضافة أو تعديل البيانات
  input UserInput {
    name: String
    email: String
    password: String
    avatar: String
    role: String
  }

  input ProductInput {
    title: String
    price: Float
    description: String
    categoryId: Int
    images: [String]
  }

  input CategoryInput {
    name: String
    image: String
  }

  # 3. الاستعلامات (Queries) - لجلب البيانات
  type Query {
    # Products with heavy filtering
    products(limit: Int, offset: Int, price_min: Int, price_max: Int, title: String, categoryId: Int): [Product]
    product(id: ID!): Product
    
    # Categories
    categories: [Category]
    category(id: ID!): Category
    
    # Users
    users: [User]
    user(id: ID!): User
    
    # Auth & Checks
    myProfile: User
    isAvailable(email: String!): Boolean
  }

  # 4. التعديلات (Mutations) - للإضافة والحذف والتعديل
  type Mutation {
    # Auth
    login(email: String!, password: String!): AuthPayload
    refreshToken(refreshToken: String!): AuthPayload
    
    # Products Operations
    addProduct(data: ProductInput!): Product
    updateProduct(id: ID!, changes: ProductInput!): Product
    deleteProduct(id: ID!): Boolean

    # Categories Operations
    addCategory(data: CategoryInput!): Category
    updateCategory(id: ID!, changes: CategoryInput!): Category
    deleteCategory(id: ID!): Boolean

    # Users Operations
    addUser(data: UserInput!): User
    updateUser(id: ID!, changes: UserInput!): User
    deleteUser(id: ID!): Boolean
    
    # File Upload (Mock)
    uploadFile(file: Upload!): File
  }
  
  scalar Upload
`;

// --- المنطق البرمجي (Resolvers) ---
const resolvers = {
  Query: {
    products: (_, { limit, offset, title, price_min, price_max, categoryId }) => {
      let data = db.products;
      if (title) data = data.filter(p => p.title.toLowerCase().includes(title.toLowerCase()));
      if (price_min) data = data.filter(p => p.price >= price_min);
      if (price_max) data = data.filter(p => p.price <= price_max);
      if (categoryId) data = data.filter(p => p.categoryId == categoryId);
      
      if (offset !== undefined && limit !== undefined) {
        return data.slice(offset, offset + limit);
      }
      return data;
    },
    product: (_, { id }) => db.products.find(p => p.id == id),

    categories: () => db.categories,
    category: (_, { id }) => db.categories.find(c => c.id == id),

    users: () => db.users,
    user: (_, { id }) => db.users.find(u => u.id == id),

    // هنا السحر: نحاول فك التوكن لمعرفة من هو المستخدم
    myProfile: (_, __, context) => {
      // بما أنه سيرفر تجريبي، سنعيد الأدمن دائماً لتسهيل الاختبار
      // لكن في الوضع الحقيقي المفروض نقرأ context.user
      return db.users[0]; 
    },

    isAvailable: (_, { email }) => {
      const exists = db.users.some(u => u.email === email);
      return !exists;
    }
  },

  Product: {
    category: (parent) => db.categories.find(c => c.id == parent.categoryId),
  },

  Mutation: {
    login: (_, { email, password }) => {
      const user = db.users.find(u => u.email === email && u.password === password);
      if (!user) {
        throw new Error('Unauthorized: Wrong email or password');
      }
      // توليد توكن حقيقي مشفر
      return generateTokens(user);
    },

    refreshToken: (_, { refreshToken }) => {
      try {
        // التحقق من صحة التوكن القديم
        const decoded = jwt.verify(refreshToken, JWT_SECRET);
        const user = db.users.find(u => u.id == decoded.sub);
        if (!user) throw new Error("User not found");
        return generateTokens(user);
      } catch (err) {
        throw new Error("Invalid Refresh Token");
      }
    },

    // --- CRUD Operations (نفس المنطق السابق) ---
    addUser: (_, { data }) => {
      const newUser = { id: String(db.users.length + 1), role: "customer", ...data };
      db.users.push(newUser);
      return newUser;
    },
    updateUser: (_, { id, changes }) => {
      const index = db.users.findIndex(u => u.id == id);
      if (index === -1) throw new Error("User not found");
      db.users[index] = { ...db.users[index], ...changes };
      return db.users[index];
    },
    deleteUser: (_, { id }) => {
      db.users = db.users.filter(u => u.id != id);
      return true;
    },

    addProduct: (_, { data }) => {
      const newProduct = { id: String(db.products.length + 1), ...data };
      db.products.push(newProduct);
      return newProduct;
    },
    updateProduct: (_, { id, changes }) => {
      const index = db.products.findIndex(p => p.id == id);
      db.products[index] = { ...db.products[index], ...changes };
      return db.products[index];
    },
    deleteProduct: (_, { id }) => {
      db.products = db.products.filter(p => p.id != id);
      return true;
    },

    addCategory: (_, { data }) => {
      const newCat = { id: String(db.categories.length + 1), ...data };
      db.categories.push(newCat);
      return newCat;
    },
    updateCategory: (_, { id, changes }) => {
      const index = db.categories.findIndex(c => c.id == id);
      db.categories[index] = { ...db.categories[index], ...changes };
      return db.categories[index];
    },
    deleteCategory: (_, { id }) => {
      db.categories = db.categories.filter(c => c.id != id);
      return true;
    }
  }
};

async function startServer() {
  const app = express();
  app.use(cors());
  app.use(bodyParser.json());

  // إعداد الكونتكست لقراءة الهيدرز
  const server = new ApolloServer({ 
    typeDefs, 
    resolvers,
    context: ({ req }) => {
      const token = req.headers.authorization || '';
      return { token };
    }
  });

  await server.start();
  server.applyMiddleware({ app, path: '/graphql' });

  // REST API Endpoints (للتوافق مع الفلاتر)
  
  // 1. Profile Endpoint
  app.get('/api/v1/auth/profile', (req, res) => {
    // يمكننا هنا فك التوكن أيضاً، لكن للسهولة سنعيد الأدمن
    res.json(db.users[0]);
  });

  // 2. Upload Endpoint (Mock)
  app.post('/api/v1/files/upload', (req, res) => {
    res.json({ 
      location: "https://placehold.co/600x400",
      originalname: "uploaded_image.png"
    });
  });

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Baytary Giant Server is running on port ${PORT}`);
  });
}

startServer();
