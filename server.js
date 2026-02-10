const express = require('express');
const { ApolloServer, gql } = require('apollo-server-express');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'baytary-secret-key-2026';

// تحميل قاعدة البيانات
let db = require('./db.json');

// --- المخطط (Schema) ---
const typeDefs = gql`
  # 1. تعريف الـ Enum
  enum Role {
    admin
    customer
  }

  # --- الكيانات (Entities) ---
  
  type Banner {
    id: ID!
    image: String!
    title: String # أضفت العنوان احتياطاً لو أردت استخدامه مستقبلاً
  }

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
    role: Role
    avatar: String
  }

  type AuthPayload {
    access_token: String
    refresh_token: String
  }

  type File {
    location: String
    filename: String
  }

  # --- المدخلات (Inputs) ---
  
  # مدخل البنر (للإضافة والتعديل)
  input BannerInput {
    image: String
    title: String
  }

  input UserInput {
    name: String
    email: String
    password: String
    avatar: String
    role: Role 
  }

  input ProductInput {
    title: String
    price: Float
    description: String
    categoryId: Float 
    images: [String]
  }

  input CategoryInput {
    name: String
    image: String
  }

  # --- الاستعلامات (Queries) ---
  type Query {
    # استعلام البنرات المستقل
    banners: [Banner]
    banner(id: ID!): Banner # لجلب بنر واحد

    products(limit: Int, offset: Int, price_min: Int, price_max: Int, title: String, categoryId: Float): [Product]
    product(id: ID!): Product
    
    categories: [Category]
    category(id: ID!): Category
    
    users: [User]
    user(id: ID!): User
    
    myProfile: User
    isAvailable(email: String!): Boolean
  }

  # --- التعديلات (Mutations) ---
  type Mutation {
    login(email: String!, password: String!): AuthPayload
    refreshToken(refreshToken: String!): AuthPayload
    
    # === عمليات البنرات (CRUD كامل) ===
    addBanner(data: BannerInput!): Banner
    updateBanner(id: ID!, changes: BannerInput!): Banner
    deleteBanner(id: ID!): Boolean
    # =================================

    # المستخدمين
    addUser(data: UserInput!): User
    deleteUser(id: ID!): Boolean
    
    # المنتجات
    addProduct(data: ProductInput!): Product
    updateProduct(id: ID!, changes: ProductInput!): Product
    deleteProduct(id: ID!): Boolean

    # التصنيفات
    addCategory(data: CategoryInput!): Category
    updateCategory(id: ID!, changes: CategoryInput!): Category
    deleteCategory(id: ID!): Boolean
    
    uploadFile(file: Upload): File
  }
  
  scalar Upload
`;

// --- المنطق (Resolvers) ---
const resolvers = {
  Query: {
    // --- Banners Query ---
    banners: () => db.banners,
    banner: (_, { id }) => db.banners.find(b => b.id == id),

    // --- Products Query ---
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
    
    myProfile: () => db.users[0], 
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
    refreshToken: () => ({ access_token: "new_valid_token", refresh_token: "new_refresh" }),

    // === Banner Mutations Logic ===
    addBanner: (_, { data }) => {
      const newBanner = { 
        id: String(db.banners.length + 1), 
        image: data.image,
        title: data.title || ""
      };
      db.banners.push(newBanner);
      return newBanner;
    },
    updateBanner: (_, { id, changes }) => {
      const index = db.banners.findIndex(b => b.id == id);
      if (index === -1) throw new Error("Banner not found");
      const updated = { ...db.banners[index], ...changes };
      db.banners[index] = updated;
      return updated;
    },
    deleteBanner: (_, { id }) => {
      db.banners = db.banners.filter(b => b.id != id);
      return true;
    },
    // ==============================

    // --- Users ---
    addUser: (_, { data }) => {
      const role = data.role || "customer";
      const newUser = { id: String(db.users.length + 1), ...data, role };
      db.users.push(newUser);
      return newUser;
    },
    deleteUser: (_, { id }) => {
      db.users = db.users.filter(u => u.id != id);
      return true;
    },

    // --- Products ---
    addProduct: (_, { data }) => {
      const newProduct = { 
        id: String(db.products.length + 1), 
        ...data,
        categoryId: parseInt(data.categoryId) 
      };
      db.products.push(newProduct);
      return newProduct;
    },
    updateProduct: (_, { id, changes }) => {
      const index = db.products.findIndex(p => p.id == id);
      const updated = { ...db.products[index], ...changes };
      if (changes.categoryId) updated.categoryId = parseInt(changes.categoryId);
      db.products[index] = updated;
      return updated;
    },
    deleteProduct: (_, { id }) => {
      db.products = db.products.filter(p => p.id != id);
      return true;
    },

    // --- Categories ---
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
    },

    // --- File Upload ---
    uploadFile: () => ({ location: "https://placehold.co/600x400", filename: "file.png" })
  }
};

async function startServer() {
  const app = express();
  app.use(cors());
  app.use(bodyParser.json());

  const server = new ApolloServer({ typeDefs, resolvers });
  await server.start();
  server.applyMiddleware({ app, path: '/graphql' });

  app.get('/api/v1/auth/profile', (req, res) => res.json(db.users[0]));
  app.post('/api/v1/files/upload', (req, res) => {
    res.json({ location: "https://placehold.co/600x400", filename: "upload.png" });
  });

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Baytary Server running on port ${PORT}`);
  });
}

startServer();
