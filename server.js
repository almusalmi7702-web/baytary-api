require('dotenv').config();
const express = require('express');
const { ApolloServer, gql } = require('apollo-server-express');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const ImageKit = require("imagekit");
const multer = require('multer');

// --- 1. إعدادات الاتصال ---
const MONGO_URI = process.env.MONGO_URI; 
const JWT_SECRET = process.env.JWT_SECRET || 'baytary-secure-key-2026';

// إعداد ImageKit باستخدام المتغيرات التي حصلت عليها
const imagekit = new ImageKit({
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
    urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
});

if (!MONGO_URI) {
  console.error("❌ Error: MONGO_URI is missing in Environment Variables!");
  process.exit(1);
}

mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ Connected to MongoDB Successfully"))
  .catch(err => console.error("❌ MongoDB Connection Error:", err));

// إعداد Multer لاستقبال الملفات في الذاكرة (Memory Storage) لضمان الاستقرار
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// دالة توليد آيدي "رقمي" (String يحتوي على أرقام فقط) ليتناسب مع Flutter
const generateId = () => String(Math.floor(100000 + Math.random() * 900000));

// --- 2. Mongoose Schemas ---
const BannerSchema = new mongoose.Schema({ _id: String, image: String, title: String });
const Banner = mongoose.model('Banner', BannerSchema);

const CategorySchema = new mongoose.Schema({ _id: String, name: String, image: String });
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

// --- 3. GraphQL Schema (تم الإبقاء على كافة مدخلاتك الأصلية) ---
const typeDefs = gql`
  enum Role { admin customer }

  type Banner { id: ID! image: String title: String }
  type Category { id: ID! name: String image: String }

  type Product {
    id: ID!
    title: String
    price: Float
    description: String
    images: [String]
    category: Category
    categoryId: Float 
  }

  type User { id: ID! name: String email: String role: Role avatar: String }
  type AuthPayload { access_token: String refresh_token: String }
  type File { location: String filename: String }

  input BannerInput { image: String title: String }
  input UserInput { name: String email: String password: String avatar: String role: Role }
  input ProductInput { title: String price: Float description: String categoryId: Float images: [String] }
  input CategoryInput { name: String image: String }

  type Query {
    banners: [Banner]
    products(limit: Int, offset: Int, title: String, categoryId: Float): [Product]
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

// --- 4. Resolvers (المنطق) ---
const resolvers = {
  Query: {
    banners: async () => await Banner.find(),
    products: async (_, { limit, offset, title, categoryId }) => {
      let filter = {};
      if (title) filter.title = { $regex: title, $options: 'i' };
      if (categoryId) filter.categoryId = String(categoryId); 
      let query = Product.find(filter);
      if (offset !== undefined && limit !== undefined) query = query.skip(offset).limit(limit);
      return await query;
    },
    product: async (_, { id }) => await Product.findById(id),
    categories: async () => await Category.find(),
    category: async (_, { id }) => await Category.findById(id),
    users: async () => await User.find(),
    user: async (_, { id }) => await User.findById(id),
    // في الجرافيك يو إل، نرجع null حالياً لأننا نستخدم الـ REST API للملف الشخصي
    myProfile: () => null, 
    isAvailable: async (_, { email }) => {
      const count = await User.countDocuments({ email });
      return count === 0;
    }
  },
  Product: {
    categoryId: (parent) => parseFloat(parent.categoryId), 
    category: async (parent) => {
        try { return await Category.findById(parent.categoryId); } catch (e) { return null; }
    }
  },
  Mutation: {
    login: async (_, { email, password }) => {
      const user = await User.findOne({ email, password });
      if (!user) throw new Error('Unauthorized');
      return { 
        access_token: jwt.sign({ sub: user._id }, JWT_SECRET), 
        refresh_token: jwt.sign({ sub: user._id }, JWT_SECRET) 
      };
    },
    addBanner: async (_, { data }) => {
      const banner = new Banner({ _id: generateId(), ...data });
      return await banner.save();
    },
    deleteBanner: async (_, { id }) => { await Banner.findByIdAndDelete(id); return true; },
    updateBanner: async (_, { id, changes }) => { return await Banner.findByIdAndUpdate(id, changes, { new: true }); },
    addUser: async (_, { data }) => {
      const user = new User({ _id: generateId(), ...data });
      return await user.save();
    },
    deleteUser: async (_, { id }) => { await User.findByIdAndDelete(id); return true; },
    addProduct: async (_, { data }) => {
      const productData = { ...data, categoryId: String(data.categoryId) };
      const product = new Product({ _id: generateId(), ...productData });
      return await product.save();
    },
    updateProduct: async (_, { id, changes }) => {
      let updateData = { ...changes };
      if (changes.categoryId) updateData.categoryId = String(changes.categoryId);
      return await Product.findByIdAndUpdate(id, updateData, { new: true });
    },
    deleteProduct: async (_, { id }) => { await Product.findByIdAndDelete(id); return true; },
    addCategory: async (_, { data }) => {
      const cat = new Category({ _id: generateId(), ...data });
      return await cat.save();
    },
    updateCategory: async (_, { id, changes }) => { return await Category.findByIdAndUpdate(id, changes, { new: true }); },
    deleteCategory: async (_, { id }) => { await Category.findByIdAndDelete(id); return true; },
    uploadFile: () => ({ location: "https://ik.imagekit.io/baytary", filename: "ready.png" })
  }
};

async function startServer() {
  const app = express();
  app.use(cors());
  app.use(bodyParser.json());

  // --- [هام جداً] وضع مسارات الـ REST قبل الـ Apollo لضمان عملها واختفاء خطأ 404 ---

  // 1. رابط رفع الصور الحقيقي (ImageKit)
  app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: "No file uploaded" });

        const result = await imagekit.upload({
            file: req.file.buffer,
            fileName: req.file.originalname,
            folder: "/baytary_uploads"
        });

        res.json({ location: result.url, filename: result.name });
    } catch (error) {
        console.error("ImageKit Error:", error);
        res.status(500).json({ message: "Upload failed", error: error.message });
    }
  });

  // 2. رابط الملف الشخصي (REST) لحل مشكلة تكرار الداتا
  app.get('/api/v1/auth/profile', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) return res.status(401).json({ message: 'No token' });
      const token = authHeader.split(' ')[1]; 
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await User.findById(decoded.sub);
      if (!user) return res.status(404).json({ message: 'User not found' });
      res.json(user);
    } catch (error) {
      return res.status(401).json({ message: 'Invalid Token' });
    }
  });

  // إعداد وتشغيل Apollo Server
  const server = new ApolloServer({ typeDefs, resolvers });
  await server.start();
  server.applyMiddleware({ app, path: '/graphql' });

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Baytary Server (ImageKit Version) Ready at port ${PORT}`);
  });
}

startServer();
