const express = require('express');
const { ApolloServer, gql } = require('apollo-server-express');
const cors = require('cors');
const bodyParser = require('body-parser');

// تحميل قاعدة البيانات (سنستخدم متغير في الذاكرة لتتمكن من التعديل فوراً)
let db = require('./db.json');

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

  # الاستعلامات (Queries)
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

  # التعديلات (Mutations)
  type Mutation {
    login(email: String!, password: String!): AuthPayload
    
    # Products
    addProduct(data: ProductInput!): Product
    updateProduct(id: ID!, changes: ProductInput!): Product
    deleteProduct(id: ID!): Boolean

    # Categories
    addCategory(data: CategoryInput!): Category
    updateCategory(id: ID!, changes: CategoryInput!): Category
    deleteCategory(id: ID!): Boolean

    # Users
    addUser(data: UserInput!): User
    updateUser(id: ID!, changes: UserInput!): User
    deleteUser(id: ID!): Boolean
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

  input UserInput {
    name: String
    email: String
    password: String
    avatar: String
    role: String
  }
`;

const resolvers = {
  Query: {
    products: (_, { limit, offset, price_min, price_max, title, categoryId }) => {
      let data = db.products;
      
      // Filters
      if (categoryId) data = data.filter(p => p.categoryId == categoryId);
      if (price_min) data = data.filter(p => p.price >= price_min);
      if (price_max) data = data.filter(p => p.price <= price_max);
      if (title) data = data.filter(p => p.title.toLowerCase().includes(title.toLowerCase()));

      // Pagination
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
    
    banners: () => db.banners || [],
    
    myProfile: () => db.users[0], // يرجع أول مستخدم كأنه هو المسجل
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
      if (user) {
        return { access_token: "mock-token-123", refresh_token: "mock-refresh-123" };
      }
      throw new Error('Invalid credentials');
    },
    
    // --- Products Mutations ---
    addProduct: (_, { data }) => {
      const newProduct = { id: db.products.length + 1, ...data };
      db.products.push(newProduct);
      return newProduct;
    },
    updateProduct: (_, { id, changes }) => {
      const index = db.products.findIndex(p => p.id == id);
      if (index === -1) throw new Error("Product not found");
      const updatedProduct = { ...db.products[index], ...changes };
      db.products[index] = updatedProduct;
      return updatedProduct;
    },
    deleteProduct: (_, { id }) => {
      db.products = db.products.filter(p => p.id != id);
      return true;
    },

    // --- Categories Mutations ---
    addCategory: (_, { data }) => {
      const newCat = { id: db.categories.length + 1, ...data };
      db.categories.push(newCat);
      return newCat;
    },
    updateCategory: (_, { id, changes }) => {
      const index = db.categories.findIndex(c => c.id == id);
      if (index === -1) throw new Error("Category not found");
      const updatedCat = { ...db.categories[index], ...changes };
      db.categories[index] = updatedCat;
      return updatedCat;
    },
    deleteCategory: (_, { id }) => {
      db.categories = db.categories.filter(c => c.id != id);
      return true;
    },

    // --- Users Mutations ---
    addUser: (_, { data }) => {
      const newUser = { id: db.users.length + 1, ...data };
      db.users.push(newUser);
      return newUser;
    },
    updateUser: (_, { id, changes }) => {
      const index = db.users.findIndex(u => u.id == id);
      if (index === -1) throw new Error("User not found");
      const updatedUser = { ...db.users[index], ...changes };
      db.users[index] = updatedUser;
      return updatedUser;
    }
    // deleteUser logic can be similar...
  }
};

async function startServer() {
  const app = express();
  app.use(cors());
  app.use(bodyParser.json());

  const server = new ApolloServer({ typeDefs, resolvers });
  await server.start();
  server.applyMiddleware({ app, path: '/graphql' });

  // --- REST API Endpoints (للتوافق مع الكود القديم) ---
  
  // 1. Auth Profile
  app.get('/api/v1/auth/profile', (req, res) => {
    res.json(db.users[0]); // دائماً يرجع الأدمن
  });

  // 2. Upload Image (Mock)
  app.post('/api/v1/files/upload', (req, res) => {
    // نرجع رابط صورة وهمية لأن السيرفر لا يخزن ملفات حقيقية حالياً
    res.json({ location: "https://placehold.co/600x400" });
  });

  // 3. Products REST fallback
  app.get('/api/v1/products', (req, res) => res.json(db.products));

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Baytary Full Server running at port ${PORT}`);
  });
}

startServer();