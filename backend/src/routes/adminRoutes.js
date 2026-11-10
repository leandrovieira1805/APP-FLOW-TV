import express from "express";
import {
  getAppConfig,
  verifyAdminPassword,
  saveAppConfig,
  getUsers,
  createAdmin,
  createAd,
  updateAd,
  deleteAd,
  getUsersWithPassword,
  deleteUserWithPassword,
  toggleUserBlockWithPassword
} from "../controllers/adminController.js";
import { isAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/config", getAppConfig);
router.post("/verify-password", verifyAdminPassword);
router.post("/config", saveAppConfig);
router.get("/users", isAdmin, getUsers);
router.post("/users-list", getUsersWithPassword);
router.delete("/users/:id", deleteUserWithPassword);
router.post("/users/:id/toggle-block", toggleUserBlockWithPassword);
router.post("/admins", createAdmin);
router.post("/ads", isAdmin, createAd);
router.put("/ads/:id", isAdmin, updateAd);
router.delete("/ads/:id", isAdmin, deleteAd);

export default router;
