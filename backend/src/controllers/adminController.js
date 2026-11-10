import prisma from "../config/prisma.js";
import { hashPassword, comparePassword } from "../services/authService.js";

export const getAppConfig = async (req, res) => {
  try {
    const config = await prisma.appConfig.findUnique({
      where: { id: 1 },
    });

    if (!config) {
      return res.json({
        logo: null,
        background: null,
        banner: null,
        bannerLink: null,
        banners: null,
        dnsList: [],
        paymentInfo: null,
        paymentStatus: null,
      });
    }

    res.json({
      logo: config.logo,
      background: config.background,
      banner: config.banner,
      bannerLink: config.bannerLink,
      banners: config.banners,
      dnsList: config.dnsList || [],
      paymentInfo: config.paymentInfo,
      paymentStatus: config.paymentStatus,
    });
  } catch (error) {
    console.error("[getAppConfig] Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const verifyAdminPassword = async (req, res) => {
  try {
    const { password } = req.body;
    const config = await prisma.appConfig.findUnique({
      where: { id: 1 },
    });

    if (!config) {
      return res.status(401).json({ ok: false });
    }

    const ok = await comparePassword(password, config.adminPassword);
    res.json({ ok });
  } catch (error) {
    console.error("[verifyAdminPassword] Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const saveAppConfig = async (req, res) => {
  try {
    const {
      password,
      logo,
      background,
      banner,
      bannerLink,
      banners,
      dnsList,
      paymentInfo,
      paymentStatus,
      newPassword,
    } = req.body;

    let config = await prisma.appConfig.findUnique({
      where: { id: 1 },
    });

    if (!config) {
      if (!newPassword) {
        return res
          .status(400)
          .json({ error: "New password required for initial setup" });
      }
      const hashedPassword = await hashPassword(newPassword);
      config = await prisma.appConfig.create({
        data: {
          id: 1,
          adminPassword: hashedPassword,
          dnsList: [],
        },
      });
    } else {
      const passwordValid = await comparePassword(password, config.adminPassword);
      if (!passwordValid) {
        return res.status(401).json({ error: "Invalid admin password" });
      }
    }

    const updateData = {
      logo: logo !== undefined ? logo : config.logo,
      background: background !== undefined ? background : config.background,
      banner: banner !== undefined ? banner : config.banner,
      bannerLink: bannerLink !== undefined ? bannerLink : config.bannerLink,
      banners: banners !== undefined ? banners : config.banners,
      dnsList: dnsList !== undefined ? dnsList : config.dnsList,
      paymentInfo: paymentInfo !== undefined ? paymentInfo : config.paymentInfo,
      paymentStatus:
        paymentStatus !== undefined ? paymentStatus : config.paymentStatus,
    };

    if (newPassword && newPassword.trim()) {
      updateData.adminPassword = await hashPassword(newPassword.trim());
    }

    const updatedConfig = await prisma.appConfig.update({
      where: { id: 1 },
      data: updateData,
    });

    res.json({
      logo: updatedConfig.logo,
      background: updatedConfig.background,
      banner: updatedConfig.banner,
      bannerLink: updatedConfig.bannerLink,
      banners: updatedConfig.banners,
      dnsList: updatedConfig.dnsList || [],
      paymentInfo: updatedConfig.paymentInfo,
      paymentStatus: updatedConfig.paymentStatus,
    });
  } catch (error) {
    console.error("[saveAppConfig] Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      include: {
        plan: true,
      },
    });
    res.json(users);
  } catch (error) {
    console.error("[getUsers] Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const createAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;
    const hashedPassword = await hashPassword(password);
    const admin = await prisma.admin.create({
      data: {
        email,
        password: hashedPassword,
      },
    });
    res.status(201).json({ id: admin.id, email: admin.email });
  } catch (error) {
    console.error("[createAdmin] Error:", error);
    if (error.code === "P2002") {
      return res.status(409).json({ error: "Email already exists" });
    }
    res.status(500).json({ error: "Internal server error" });
  }
};

export const createAd = async (req, res) => {
  try {
    const { title, description, imageUrl, linkUrl, active, startDate, endDate } =
      req.body;
    const ad = await prisma.ads.create({
      data: {
        title,
        description,
        imageUrl,
        linkUrl,
        active,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
      },
    });
    res.status(201).json(ad);
  } catch (error) {
    console.error("[createAd] Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const updateAd = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, imageUrl, linkUrl, active, startDate, endDate } =
      req.body;
    const ad = await prisma.ads.update({
      where: { id },
      data: {
        title,
        description,
        imageUrl,
        linkUrl,
        active,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
      },
    });
    res.json(ad);
  } catch (error) {
    console.error("[updateAd] Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const deleteAd = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.ads.delete({
      where: { id },
    });
    res.json({ message: "Ad deleted successfully" });
  } catch (error) {
    console.error("[deleteAd] Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getUsersWithPassword = async (req, res) => {
  try {
    const { password } = req.body;
    const config = await prisma.appConfig.findUnique({ where: { id: 1 } });
    if (!config) return res.status(401).json({ error: "Unauthorized" });
    const ok = await comparePassword(password, config.adminPassword);
    if (!ok) return res.status(401).json({ error: "Invalid admin password" });

    const users = await prisma.user.findMany({
      include: { 
        plan: true,
        sessions: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(users);
  } catch (error) {
    console.error("[getUsersWithPassword] Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const deleteUserWithPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;
    const config = await prisma.appConfig.findUnique({ where: { id: 1 } });
    if (!config) return res.status(401).json({ error: "Unauthorized" });
    const ok = await comparePassword(password, config.adminPassword);
    if (!ok) return res.status(401).json({ error: "Invalid admin password" });

    await prisma.user.delete({
      where: { id },
    });
    res.json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("[deleteUserWithPassword] Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const toggleUserBlockWithPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;
    const config = await prisma.appConfig.findUnique({ where: { id: 1 } });
    if (!config) return res.status(401).json({ error: "Unauthorized" });
    const ok = await comparePassword(password, config.adminPassword);
    if (!ok) return res.status(401).json({ error: "Invalid admin password" });

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ error: "User not found" });

    const updatedUser = await prisma.user.update({
      where: { id },
      data: { blocked: !user.blocked },
    });
    res.json({ message: "User block status toggled", blocked: updatedUser.blocked });
  } catch (error) {
    console.error("[toggleUserBlockWithPassword] Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
