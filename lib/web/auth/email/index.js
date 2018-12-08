'use strict'

const Router = require('express').Router
const passport = require('passport')
const validator = require('validator')
const LocalStrategy = require('passport-local').Strategy
const config = require('../../../config')
const models = require('../../../models')
const logger = require('../../../logger')
const { setReturnToFromReferer } = require('../utils')
const { urlencodedParser } = require('../../utils')
const response = require('../../../response')

let emailAuth = module.exports = Router()

passport.use(new LocalStrategy({
	usernameField: 'email'
}, function (email, password, done) {
	if (!validator.isEmail(email)) return done(null, false)
	models.User.findOne({
		where: {
			email: email
		}
	}).then(function (user) {
		if (!user) return done(null, false)
		if (!user.verifyPassword(password)) return done(null, false)
		return done(null, user)
	}).catch(function (err) {
		logger.error(err)
		return done(err)
	})
}))

if (config.allowEmailRegister) {
	emailAuth.post('/register', urlencodedParser, function (req, res, next) {
		if (config.registerKey) {
			if (!req.body.regkey) {
				req.flash('error', "Please enter a register key.")
				return res.redirect(config.serverURL + '/')
			} else {
				logger.debug("verify registerKey: " + req.body.regkey)
				if (req.body.regkey !== config.registerKey) {
					req.flash('error', "Register key is not correct, please try again.")
					return res.redirect(config.serverURL + '/')
				}
			}
		}

		if (!req.body.email || !req.body.password) return response.errorBadRequest(res)
		if (!validator.isEmail(req.body.email)) {
			req.flash('error', "Invalid email, please try again.")
			return res.redirect(config.serverURL + '/')
		}

		models.User.findOrCreate({
			where: {
				email: req.body.email
			},
			defaults: {
				password: req.body.password,
				profile: JSON.stringify({ displayName: req.body.displayName, photoUrl: req.body.photoUrl })
			}
		}).spread(function (user, created) {
			if (user) {
				if (created) {
					logger.debug('user registered: ' + user.id)
					req.flash('info', "You've successfully registered, please signin.")
				} else {
					logger.debug('user found: ' + user.id)
					req.flash('error', 'This email has been used, please try another one.')
				}
				return res.redirect(config.serverURL + '/')
			}
			req.flash('error', 'Failed to register your account, please try again.')
			return res.redirect(config.serverURL + '/')
		}).catch(function (err) {
			logger.error('auth callback failed: ' + err)
			return response.errorInternalError(res)
		})
	})
}

emailAuth.post('/login', urlencodedParser, function (req, res, next) {
	if (!req.body.email || !req.body.password) return response.errorBadRequest(res)
	if (!validator.isEmail(req.body.email)) return response.errorBadRequest(res)
	setReturnToFromReferer(req)
	passport.authenticate('local', {
		successReturnToOrRedirect: config.serverURL + '/',
		failureRedirect: config.serverURL + '/',
		failureFlash: 'Invalid email or password.'
	})(req, res, next)
})

emailAuth.post('/editprofile', urlencodedParser, function (req, res, next) {
	if (req.isAuthenticated()) {
		if (!req.body.password && !req.body.displayName && !req.body.photoUrl) {
			req.flash('error', "Nothing is changed, please try again.")
			return res.redirect(config.serverURL + '/')
		}

		models.User.findOne({
			where: {
				id: req.user.id
			}
		}).then(function (user) {
			if (!user) { return response.errorNotFound(res) }

			if (!user.email) {
				req.flash('error', "For email registered users only.")
				return res.redirect(config.serverURL + '/')
			}

			var profile = models.User.getProfile(user)

			if (req.body.password)
				user.password = req.body.password

			user.profile = JSON.stringify({
				displayName: req.body.displayName ? req.body.displayName : profile.name,
				photoUrl: req.body.photoUrl ? req.body.photoUrl : profile.photo
			})

			user.save().then(function () {
				if (req.body.password) {
					req.flash('info', "Profile has been changed successfully, please signin with the new password.")
					return res.redirect(config.serverURL + '/logout')

				}
				req.flash('info', "Profile has been changed successfully.")
				return res.redirect(config.serverURL + '/')
			})

		}).catch(function (err) {
			logger.error('edit profile failed: ' + err)
			return response.errorInternalError(res)
		})
	} else {
		res.send({
			status: 'forbidden'
		})
	}

})
