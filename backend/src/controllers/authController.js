import prisma from '../config/prisma.js'
import {
  hashPassword,
  comparePassword,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '../services/authService.js'

export const register = async (req, res) => {
  try {
    const { email, password, username } = req.body

    const existingUser = await prisma.user.findUnique({
      where: { email },
    })

    if (existingUser) {
      if (existingUser.blocked) {
        return res.status(403).json({ error: 'User is blocked' })
      }
      return res.status(400).json({ error: 'Email already in use' })
    }

    const hashedPassword = await hashPassword(password)

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        username,
        profiles: {
          create: {
            username,
          },
        },
        settings: {
          create: {},
        },
      },
      include: {
        profiles: true,
        settings: true,
      },
    })

    const accessToken = generateAccessToken(user.id)
    const refreshToken = generateRefreshToken(user.id)

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    await prisma.session.create({
      data: {
        userId: user.id,
        refreshToken,
        expiresAt,
      },
    })

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        avatarUrl: user.avatarUrl,
      },
      accessToken,
      refreshToken,
    })
  } catch (error) {
    console.error('Register error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const login = async (req, res) => {
  try {
    const { email, password } = req.body

    const user = await prisma.user.findUnique({
      where: { email },
    })

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    if (user.blocked) {
      return res.status(403).json({ error: 'User is blocked' })
    }

    const isPasswordValid = await comparePassword(password, user.password)

    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const accessToken = generateAccessToken(user.id)
    const refreshToken = generateRefreshToken(user.id)

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    await prisma.session.create({
      data: {
        userId: user.id,
        refreshToken,
        expiresAt,
      },
    })

    res.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        avatarUrl: user.avatarUrl,
      },
      accessToken,
      refreshToken,
    })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const refreshToken = async (req, res) => {
  try {
    const { refreshToken: token } = req.body

    if (!token) {
      return res.status(401).json({ error: 'Refresh token required' })
    }

    const decoded = verifyRefreshToken(token)
    const session = await prisma.session.findUnique({
      where: { refreshToken: token },
    })

    if (!session || session.userId !== decoded.userId) {
      return res.status(403).json({ error: 'Invalid refresh token' })
    }

    // Check if user is blocked before issuing new tokens
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } })
    if (user && user.blocked) {
      // Delete the session so the blocked user can't try again
      await prisma.session.delete({ where: { id: session.id } })
      return res.status(403).json({ error: 'User is blocked' })
    }

    const newAccessToken = generateAccessToken(decoded.userId)
    const newRefreshToken = generateRefreshToken(decoded.userId)

    await prisma.session.update({
      where: { id: session.id },
      data: { refreshToken: newRefreshToken },
    })

    res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    })
  } catch (error) {
    console.error('Refresh token error:', error)
    res.status(403).json({ error: 'Invalid or expired refresh token' })
  }
}

export const logout = async (req, res) => {
  try {
    const { refreshToken: token } = req.body

    if (token) {
      await prisma.session.deleteMany({
        where: { refreshToken: token },
      })
    }

    res.json({ message: 'Logged out successfully' })
  } catch (error) {
    console.error('Logout error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}
