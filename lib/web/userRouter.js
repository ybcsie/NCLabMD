'use strict'

const archiver = require('archiver')
const async = require('async')
const Router = require('express').Router

const response = require('../response')
const config = require('../config')
const models = require('../models')
const logger = require('../logger')
const { generateAvatar } = require('../letter-avatars')

const UserRouter = module.exports = Router()

// get me info
UserRouter.get('/me', function (req, res) {
	if (req.isAuthenticated()) {
		models.User.findOne({
			where: {
				id: req.user.id
			}
		}).then(function (user) {
			if (!user) { return response.errorNotFound(res) }
			var profile = models.User.getProfile(user)
			res.send({
				status: 'ok',
				id: req.user.id,
				name: profile.name,
				photo: profile.photo
			})
		}).catch(function (err) {
			logger.error('read me failed: ' + err)
			return response.errorInternalError(res)
		})
	} else {
		res.send({
			status: 'forbidden'
		})
	}
})

// delete the currently authenticated user
UserRouter.get('/me/delete/:token?', function (req, res) {
	if (req.isAuthenticated()) {
		models.User.findOne({
			where: {
				id: req.user.id
			}
		}).then(function (user) {
			if (!user) {
				return response.errorNotFound(res)
			}
			if (user.deleteToken === req.params.token) {
				user.destroy().then(function () {
					res.redirect(config.serverURL + '/')
				})
			} else {
				return response.errorForbidden(res)
			}
		}).catch(function (err) {
			logger.error('delete user failed: ' + err)
			return response.errorInternalError(res)
		})
	} else {
		return response.errorForbidden(res)
	}
})

// export the data of the authenticated user
UserRouter.get('/me/export', function (req, res) {
	if (req.isAuthenticated()) {
		// let output = fs.createWriteStream(__dirname + '/example.zip');
		let archive = archiver('zip', {
			zlib: { level: 3 } // Sets the compression level.
		})
		res.setHeader('Content-Type', 'application/zip')
		res.attachment('archive.zip')
		archive.pipe(res)
		archive.on('error', function (err) {
			logger.error('export user data failed: ' + err)
			return response.errorInternalError(res)
		})
		models.User.findOne({
			where: {
				id: req.user.id
			}
		}).then(function (user) {
			models.Note.findAll({
				where: {
					ownerId: user.id
				}
			}).then(function (notes) {
				let filenames = {}
				async.each(notes, function (note, callback) {
					let basename = note.title.replace(/\//g, '-') // Prevent subdirectories
					let filename
					let suffix = ''
					do {
						let seperator = typeof suffix === 'number' ? '-' : ''
						filename = basename + seperator + suffix + '.md'
						suffix++
					} while (filenames[filename])
					filenames[filename] = true

					logger.debug('Write: ' + filename)
					archive.append(Buffer.from(note.content), { name: filename, date: note.lastchangeAt })
					callback(null, null)
				}, function (err) {
					if (err) {
						return response.errorInternalError(res)
					}

					archive.finalize()
				})
			})
		}).catch(function (err) {
			logger.error('export user data failed: ' + err)
			return response.errorInternalError(res)
		})
	} else {
		return response.errorForbidden(res)
	}
})

/*NCLab start*/
// get user all notes
UserRouter.get('/meall', function (req, res) {
	if (req.isAuthenticated()) {
		models.User.findOne({
			where: {
				id: req.user.id
			}
		}).then(function (user) {
			models.Note.findAll({
				where: {
					ownerId: user.id
				}

			}).then(function (notes) {
				let list = []
				async.each(notes, function (note, callback) {
					list.push({ id: models.Note.encodeNoteId(note.id), text: note.title, time: (note.lastchangeAt ? note.lastchangeAt : note.createdAt).getTime(), tags: models.Note.parseNoteInfo(note.content).tags })
					callback(null, null)
				}, function (err) {
					if (err) {
						return response.errorInternalError(res)
					}

					res.send({
						status: 'ok',
						meall: list
					})

				})


			})
		}).catch(function (err) {
			logger.error('read me all failed: ' + err)
			return response.errorInternalError(res)
		})
	} else {
		res.send({
			status: 'forbidden'
		})
	}
})

// get lab all viewable notes
UserRouter.get('/laball', function (req, res) {
	models.User.findAll().then(function (users) {

		let list = []
		async.each(users, function (user, callback) {
			// start each
			var ownername = models.User.getProfile(user).name;

			models.Note.findAll({
				// start find all notes
				where: {
					permission: { $ne: "private" },
					ownerId: user.id
				}
				// end find all notes

			}).then(function (notes) {
				// start deal with all notes
				async.each(notes, function (note, callback) {
					// start each
					list.push({ id: models.Note.encodeNoteId(note.id), owner: ownername, text: note.title, time: (note.lastchangeAt ? note.lastchangeAt : note.createdAt).getTime(), tags: models.Note.parseNoteInfo(note.content).tags });
					callback(null, null)

				}, function (err) {
					if (err) {
						return response.errorInternalError(res)
					}

					callback(null, null)

				})// end each

			})// end deal all notes



		}, function (err) {
			if (err) {
				return response.errorInternalError(res)
			}

			res.send({
				status: 'ok',
				laball: list
			})

		})// end each

	}).catch(function (err) {
		logger.error('read lab all failed: ' + err)
		return response.errorInternalError(res)
	})

})

/*NCLab end*/

UserRouter.get('/user/:username/avatar.svg', function (req, res, next) {
	res.setHeader('Content-Type', 'image/svg+xml')
	res.setHeader('Cache-Control', 'public, max-age=86400')
	res.send(generateAvatar(req.params.username))
})
