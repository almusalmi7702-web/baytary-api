const express = require('express');
const { ApolloServer, gql } = require('apollo-server-express');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');

// --- إعدادات الأمان ---
const JWT_SECRET = 'baytary-secure-key-2026';

// --- قاعدة البيانات (محاكية تماماً لما يطلبه تطبيقك) ---
let db = {
  products: [
    { id: "1", title: "لقاح بيطري مخصص", price: 250, description: "لقاح ممتاز للماشية", images: ["https://placehold.co/600x400"], categoryId: 1 },
    { id: "2", title: "فيتامينات شاملة", price: 120, description: "مكمل غذائي", images: ["https://placehold.co/600x400"], categoryId: 1 },
    { id: "3", title: "معدات جراحية", price: 500, description: "طقم جراحي كامل", images: ["https://placehold.co/600x400"], categoryId: 2 }
  ],
  categories: [
    { id: "1", name: "أدوية ولقاحات", image: "https://placehold.co/600x400" },
    { id: "2", name: "معدات طبية", image: "https://placehold.co/600x400" },
    { id: "3", name: "أعلاف", image: "https://placehold.co/600x400" },
    { id: "4", name: "اكسسوارات", image: "https://placehold.co/600x400" },
    { id: "5", name: "عناية", image: "https://placehold.co/600x400" }
  ],
  users: [
    { id: "1", name: "Admin Manager", email: "admin@mail.com", password: "123", role: "admin", avatar: "https://i.pravatar.cc/150?u=1" },
    { id: "2", name: "Customer One", email: "john@mail.com", password: "changeme", role: "customer", avatar: "https://i.pravatar.cc/150?u=2" }
  ],
  banners: [
    { id: "1", title: "عرض الافتتاح", image: "https://placehold.co/1200x400/blue/white" },
    { id: "2", title: "خصومات الصيف", image: "https://placehold.co/1200x400/red/white" }
  ]
};

// --- السكيما (مطابقة لملفات الكويري عندك) ---
const typeDefs = gql`
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
  
  type Banner {
    id: ID!
    title: String
    image: String
  }

  type AuthPayload {
    access_token: String
    refresh_token: String
  }

  type File {
    location: String
  }

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

  type Query {
    products(limit: Int, offset: Int, price_min: Int, price_max: Int, title: String, categoryId: Int): [Product]
    product(id: ID!): Product
    
    categories: [Category]
    category(id: ID!): Category
    
    users: [User]
    user(id: ID!): User
    
    banners: [Banner] 
    
    myProfile: User
    isAvailable(email: String!): Boolean
  }

  type Mutation {
    login(email: String!, password: String!): AuthPayload
    refreshToken(refreshToken: String!): AuthPayload
    
    # Auth & Users
    addUser(data: UserInput!): User
    signUp(data: UserInput!): User  # أضفت لك هذا احتياطاً لو كان اسم الدالة مختلف
    updateUser(id: ID!, changes: UserInput!): User
    deleteUser(id: ID!): Boolean

    # Products
    addProduct(data: ProductInput!): Product
    updateProduct(id: ID!, changes: ProductInput!): Product
    deleteProduct(id: ID!): Boolean

    # Categories
    addCategory(data: CategoryInput!): Category
    updateCategory(id: ID!, changes: CategoryInput!): Category
    deleteCategory(id: ID!): Boolean
    
    uploadFile(file: Upload): File
  }
  
  scalar Upload
`;

const resolvers = {
  Query: {
    products: (_, { limit, offset, title, price_min, price_max, categoryId }) => {
      let data = db.products;
      if (title) data = data.filter(p => p.title.toLowerCase().includes(title.toLowerCase()));
      if (categoryId) data = data.filter(p => p.categoryId == categoryId);
      if (offset !== undefined && limit !== undefined) return data.slice(offset, offset + limit);
      return data;
    },
    product: (_, { id }) => db.products.find(p => p.id == id),
    categories: () => db.categories,
    category: (_, { id }) => db.categories.find(c => c.id == id),
    users: () => db.users,
    user: (_, { id }) => db.users.find(u => u.id == id),
    banners: () => db.banners, // لدعم getBanners
    myProfile: () => db.users[0], // يرجع دائماً الأدمن
    isAvailable: (_, { email }) => !db.users.some(u => u.email === email)
  },
  Product: {
    category: (parent) => db.categories.find(c => c.id == parent.categoryId),
  },
  Mutation: {
    login: (_, { email, password }) => {
      const user = db.users.find(u => u.email === email && u.password === password);
      if (!user) throw new Error('Unauthorized');
      return { 
        access_token: jwt.sign({ sub: user.id }, JWT_SECRET), 
        refresh_token: jwt.sign({ sub: user.id }, JWT_SECRET) 
      };
    },
    refreshToken: () => ({ access_token: "mock-new-token", refresh_token: "mock-new-refresh" }),
    
    // Users
    addUser: (_, { data }) => {
      const newUser = { id: String(db.users.length + 1), role: "customer", ...data };
      db.users.push(newUser);
      return newUser;
    },
    signUp: (_, { data }) => { // نفس منطق addUser
      const newUser = { id: String(db.users.length + 1), role: "customer", ...data };
      db.users.push(newUser);
      return newUser;
    },
    
    // Products
    addProduct: (_, { data }) => {
      const newProduct = { id: String(db.products.length + 1), ...data };
      db.products.push(newProduct);
      return newProduct;
    },
    deleteProduct: (_, { id }) => {
      db.products = db.products.filter(p => p.id != id);
      return true;
    },
    updateProduct: (_, { id, changes }) => {
       const index = db.products.findIndex(p => p.id == id);
       db.products[index] = { ...db.products[index], ...changes };
       return db.products[index];
    },

    // Categories
    addCategory: (_, { data }) => {
      const newCat = { id: String(db.categories.length + 1), ...data };
      db.categories.push(newCat);
      return newCat;
    },
    deleteCategory: (_, { id }) => {
      db.categories = db.categories.filter(c => c.id != id);
      return true;
    },
    updateCategory: (_, { id, changes }) => {
       const index = db.categories.findIndex(c => c.id == id);
       db.categories[index] = { ...db.categories[index], ...changes };
       return db.categories[index];
    }
  }
};

async function startServer() {
  const app = express();
  app.use(cors());
  app.use(bodyParser.json());

  const server = new ApolloServer({ typeDefs, resolvers });
  await server.start();
  server.applyMiddleware({ app, path: '/graphql' });

  // --- REST API Endpoints (للتوافق مع ApiService.dart) ---
  
  // 1. Profile Endpoint (Auth/Profile)
  app.get('/api/v1/auth/profile', (req, res) => {
    // نرجع بيانات المستخدم رقم 1 دائماً لضمان عمل التطبيق
    res.json(db.users[0]);
  });

  // 2. Upload Endpoint (Files/Upload)
  // يطابق: @POST('/api/v1/files/upload?file')
  app.post('/api/v1/files/upload', (req, res) => {
    console.log("Upload Request Received");
    res.json({ 
      location: "https://placehold.co/600x400", // الرابط الذي ينتظره التطبيق
      originalname: "file.png",
      filename: "file.png"
    });
  });

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Baytary Compatible Server running on port ${PORT}`);
  });
}

startServer();
