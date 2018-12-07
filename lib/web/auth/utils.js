'use strict'

const models = require('../../models')
const config = require('../../config')
const logger = require('../../logger')

exports.setReturnToFromReferer = function setReturnToFromReferer(req) {
	var referer = req.get('referer')
	if (!req.session) req.session = {}
	req.session.returnTo = referer
	req.session.registerKey = req.query.regkey;
}

exports.passportGeneralCallback = function callback(req, accessToken, refreshToken, profile, done) {
	var stringifiedProfile = JSON.stringify(profile)

	models.User.findOne({
		where: {
			profileid: profile.id.toString()
		}
	}).then(function (user) {
		if (user) {
			var needSave = false
			if (user.profile !== stringifiedProfile) {
				user.profile = stringifiedProfile
				needSave = true
			}
			if (user.accessToken !== accessToken) {
				user.accessToken = accessToken
				needSave = true
			}
			if (user.refreshToken !== refreshToken) {
				user.refreshToken = refreshToken
				needSave = true
			}
			if (needSave) {
				user.save().then(function () {
					if (config.debug) { logger.info('user login: ' + user.id) }
					return done(null, user)
				})
			} else {
				if (config.debug) { logger.info('user login: ' + user.id) }
				return done(null, user)
			}
		} else {

			if (config.registerKey) {
				logger.debug("verify registerKey: " + req.session.registerKey)
				if (req.session.registerKey !== config.registerKey)
					return done(null, false, { message: 'Register key is not correct, please try again.' })//new reg and key error
				else {
					logger.debug("registerKey verified.")

					models.User.create({
						profileid: profile.id.toString(),
						profile: stringifiedProfile,
						accessToken: accessToken,
						refreshToken: refreshToken
					}).then(function (user) {
						return done(null, user)
					})

				}

			}
			else {
				models.User.create({
					profileid: profile.id.toString(),
					profile: stringifiedProfile,
					accessToken: accessToken,
					refreshToken: refreshToken
				}).then(function (user) {
					return done(null, user)
				})
			}
		}

	}).catch(function (err) {
		logger.error('auth callback failed: ' + err)
		return done(err, null)
	})

}
