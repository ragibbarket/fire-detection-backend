const express = require('express')
const router = express.Router()
const User = require('../models/User')
const DeviceMembership = require('../models/DeviceMembership')
const Invitation = require('../models/Invitation')
const {
  hashPassword,
  comparePassword,
  signToken,
} = require('../services/authService')

const MAX_ACTIVE_USERS_PER_DEVICE = 5 // matches "including the Owner" - see routes/deviceRoutes.js

// POST /api/auth/register-owner
// Bootstraps the very first (and only) owner for a device. Fails if that
// device already has an active owner - use the invite flow after that.
router.post('/register-owner', async (req, res) => {
  try {
    const { deviceId, name, email, password } = req.body
    if (!deviceId || !name || !email || !password) {
      return res
        .status(400)
        .json({ error: 'deviceId, name, email, and password are required' })
    }
    if (password.length < 8) {
      return res
        .status(400)
        .json({ error: 'Password must be at least 8 characters' })
    }

    const existingOwner = await DeviceMembership.findOne({
      device: deviceId,
      role: 'owner',
      status: 'active',
    })
    if (existingOwner) {
      return res
        .status(409)
        .json({
          error:
            'This device already has an owner - ask them to invite you instead',
        })
    }

    let user = await User.findOne({ email: email.toLowerCase() })
    if (!user) {
      const passwordHash = await hashPassword(password)
      user = await User.create({
        name,
        email: email.toLowerCase(),
        passwordHash,
      })
    }

    await DeviceMembership.create({
      device: deviceId,
      user: user._id,
      role: 'owner',
      status: 'active',
    })

    const token = signToken({ userId: user._id.toString(), email: user.email })
    res.status(201).json({
      token,
      user: { id: user._id, name: user.name, email: user.email },
      memberships: [{ device: deviceId, role: 'owner' }],
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to register owner' })
  }
})

// POST /api/auth/login
// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password)
      return res.status(400).json({ error: 'email and password are required' })

    const user = await User.findOne({ email: email.toLowerCase() })
    if (!user)
      return res.status(401).json({ error: 'Invalid email or password' })

    const valid = await comparePassword(password, user.passwordHash)
    if (!valid)
      return res.status(401).json({ error: 'Invalid email or password' })

    const memberships = await DeviceMembership.find({
      user: user._id,
      status: 'active',
    }).select('device role')

    // NEW: block login if the user has no active device membership left (removed)
    if (memberships.length === 0) {
      return res
        .status(403)
        .json({ error: 'Your access has been removed from this device' })
    }

    const token = signToken({ userId: user._id.toString(), email: user.email })
    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email },
      memberships,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to log in' })
  }
})

// POST /api/auth/accept-invite
// Body: { token, name, password } - token comes from the invite email link.
router.post('/accept-invite', async (req, res) => {
  try {
    const { token, name, password } = req.body
    if (!token || !name || !password) {
      return res
        .status(400)
        .json({ error: 'token, name, and password are required' })
    }
    if (password.length < 8) {
      return res
        .status(400)
        .json({ error: 'Password must be at least 8 characters' })
    }

    const invitation = await Invitation.findOne({ token, status: 'pending' })
    if (!invitation)
      return res
        .status(404)
        .json({ error: 'Invalid or already-used invitation link' })
    if (invitation.expiresAt < new Date()) {
      invitation.status = 'expired'
      await invitation.save()
      return res
        .status(410)
        .json({
          error: 'This invitation has expired - ask the owner to resend it',
        })
    }

    // re-check the cap at accept time too, in case it filled up between invite and accept
    const activeCount = await DeviceMembership.countDocuments({
      device: invitation.device,
      status: 'active',
    })
    if (activeCount >= MAX_ACTIVE_USERS_PER_DEVICE) {
      return res
        .status(409)
        .json({
          error: 'This device already has the maximum number of active users',
        })
    }

    let user = await User.findOne({ email: invitation.email })
    if (!user) {
      const passwordHash = await hashPassword(password)
      user = await User.create({ name, email: invitation.email, passwordHash })
    }

    const existingMembership = await DeviceMembership.findOne({
      device: invitation.device,
      user: user._id,
    })
    if (existingMembership) {
      existingMembership.status = 'active'
      existingMembership.invitedAt = new Date()
      existingMembership.removedAt = null
      await existingMembership.save()
    } else {
      await DeviceMembership.create({
        device: invitation.device,
        user: user._id,
        role: 'member',
        status: 'active',
      })
    }

    invitation.status = 'accepted'
    await invitation.save()

    const jwtToken = signToken({
      userId: user._id.toString(),
      email: user.email,
    })
    res.status(201).json({
      token: jwtToken,
      user: { id: user._id, name: user.name, email: user.email },
      memberships: [{ device: invitation.device, role: 'member' }],
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to accept invitation' })
  }
})

module.exports = router
