require('dotenv').config();
const express = require('express');
const { ApolloServer, gql } = require('apollo-server-express');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

// --- 1. إعدادات الاتصال الآمنة ---
// الآن السيرفر لن يعمل إلا إذا وجد المتغير في Railway
const MONGO_URI = process.env.MONGO_URI; 
const JWT_SECRET = process.env.JWT_SECRET || 'baytary-secure-key-2026';

if (!MONGO_URI) {
  console.error("❌ Error: MONGO_URI is missing in Environment Variables!");
  process.exit(1); // إيقاف السيرفر إذا لم يوجد الرابط
}

// --- الاتصال بقاعدة البيانات ---
mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ Connected to MongoDB Successfully"))
  .catch(err => console.error("❌ MongoDB Connection Error:", err));

// --- 2. دالة توليد آيدي رقمي قصير (لحل مشكلة فلاتر) ---
// تنتج رقماً عشوائياً بين 100000 و 999999
const generateId = () => String(Math.floor(100000 + Math.random() * 900000));

// --- 3. تصميم الجداول (Schemas) ---
// نستخدم _id: String لنتمكن من استخدام دالة generateId

const BannerSchema = new mongoose.Schema({
  _id: String,
  image: String,
  title: String
});
const Banner = mongoose.model('Banner', BannerSchema);

const CategorySchema = new mongoose.Schema({
  _id: String,
  name: String,
  image: String
});
const Category = mongoose.model('Category', CategorySchema);

const ProductSchema = new mongoose.Schema({
  _id: String,
  title: String,
  price: Number,
  description: String,
  images: [String],
  categoryId: String, 
});
const Product = mongoose.model('Product', ProductSchema);

const UserSchema = new mongoose.Schema({
  _id: String,
  name: String,
  email: { type: String, unique: true },
  password: String,
  role: { type: String, enum: ['admin', 'customer'], default: 'customer' },
  avatar: String
});
const User = mongoose.model('User', UserSchema);

// --- GraphQL Schema ---
const typeDefs = gql`
  enum Role {
    admin
    customer
  }

  type Banner {
    id: ID!
    image: String
    title: String
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
    categoryId: String
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
    categoryId: String
    images: [String]
  }

  input CategoryInput {
    name: String
    image: String
  }

  type Query {
    banners: [Banner]
    products(limit: Int, offset: Int, title: String, categoryId: String): [Product]
    product(id: ID!): Product
    categories: [Category]
    category(id: ID!): Category
    users: [User]
    user(id: ID!): User
    myProfile: User
    isAvailable(email: String!): Boolean
  }

  type Mutation {
    login(email: String!, password: String!): AuthPayload
    
    addBanner(data: BannerInput!): Banner
    deleteBanner(id: ID!): Boolean
    updateBanner(id: ID!, changes: BannerInput!): Banner

    addUser(data: UserInput!): User
    deleteUser(id: ID!): Boolean
    
    addProduct(data: ProductInput!): Product
    updateProduct(id: ID!, changes: ProductInput!): Product
    deleteProduct(id: ID!): Boolean

    addCategory(data: CategoryInput!): Category
    updateCategory(id: ID!, changes: CategoryInput!): Category
    deleteCategory(id: ID!): Boolean
    
    uploadFile(file: Upload): File
  }
  
  scalar Upload
`;

// --- Resolvers ---
const resolvers = {
  Query: {
    banners: async () => await Banner.find(),
    products: async (_, { limit, offset, title, categoryId }) => {
      let filter = {};
      if (title) filter.title = { $regex: title, $options: 'i' };
      if (categoryId) filter.categoryId = categoryId;
      
      let query = Product.find(filter);
      if (offset !== undefined && limit !== undefined) {
        query = query.skip(offset).limit(limit);
      }
      return await query;
    },
    product: async (_, { id }) => await Product.findById(id),
    categories: async () => await Category.find(),
    category: async (_, { id }) => await Category.findById(id),
    users: async () => await User.find(),
    user: async (_, { id }) => await User.findById(id),
    
    myProfile: async () => await User.findOne(), 
    
    isAvailable: async (_, { email }) => {
      const count = await User.countDocuments({ email });
      return count === 0;
    }
  },

  Product: {
    category: async (parent) => {
        try {
            return await Category.findById(parent.categoryId);
        } catch (e) {
            return null;
        }
    }
  },

  Mutation: {
    login: async (_, { email, password }) => {
      const user = await User.findOne({ email, password });
      if (!user) throw new Error('Unauthorized');
      return { 
        access_token: jwt.sign({ sub: user.id }, JWT_SECRET), 
        refresh_token: jwt.sign({ sub: user.id }, JWT_SECRET) 
      };
    },

    // --- Banners ---
    addBanner: async (_, { data }) => {
      const banner = new Banner({ _id: generateId(), ...data });
      return await banner.save();
    },
    deleteBanner: async (_, { id }) => {
      await Banner.findByIdAndDelete(id);
      return true;
    },
    updateBanner: async (_, { id, changes }) => {
      return await Banner.findByIdAndUpdate(id, changes, { new: true });
    },

    // --- Users ---
    addUser: async (_, { data }) => {
      const user = new User({ _id: generateId(), ...data });
      return await user.save();
    },
    deleteUser: async (_, { id }) => {
      await User.findByIdAndDelete(id);
      return true;
    },

    // --- Products ---
    addProduct: async (_, { data }) => {
      const product = new Product({ _id: generateId(), ...data });
      return await product.save();
    },
    updateProduct: async (_, { id, changes }) => {
      return await Product.findByIdAndUpdate(id, changes, { new: true });
    },
    deleteProduct: async (_, { id }) => {
      await Product.findByIdAndDelete(id);
      return true;
    },

    // --- Categories ---
    addCategory: async (_, { data }) => {
      const cat = new Category({ _id: generateId(), ...data });
      return await cat.save();
    },
    updateCategory: async (_, { id, changes }) => {
      return await Category.findByIdAndUpdate(id, changes, { new: true });
    },
    deleteCategory: async (_, { id }) => {
      await Category.findByIdAndDelete(id);
      return true;
    },

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

  // REST API Endpoints
  app.get('/api/v1/auth/profile', async (req, res) => {
    const user = await User.findOne();
    res.json(user);
  });
  
  app.post('/api/v1/files/upload', (req, res) => {
    res.json({ location: "https://placehold.co/600x400", filename: "upload.png" });
  });

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Baytary MongoDB Server running on port ${PORT}`);
  });
}

startServer();
