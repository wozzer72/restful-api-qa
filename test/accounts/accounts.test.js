// this test script runs through a few various different accounts
//  including password reset, username reset, change details add and remove account

// mock the general console loggers - removes unnecessary output while running
// global.console = {
//     log: jest.fn(),
//     warn: jest.fn(),
//     error: jest.fn()
// }

const supertest = require('supertest');
const baseEndpoint = require('../utils/baseUrl').baseurl;
const apiEndpoint = supertest(baseEndpoint);
const uuid = require('uuid');

// mocked real postcode/location data
// http://localhost:3000/api/test/locations/random?limit=5
const locations = require('../mockdata/locations').data;
const postcodes = require('../mockdata/postcodes').data;

const registrationUtils = require('../utils/registration');
const serviceUtils = require('../utils/services');

describe ("Password Restes", async () => {
    let nonCqcServices = null;
    beforeAll(async () => {
        const nonCqcServicesResults = await apiEndpoint.get('/services/byCategory?cqc=false')
            .expect('Content-Type', /json/)
            .expect(200);
        nonCqcServices = nonCqcServicesResults.body;
    });

    beforeEach(async () => {
    });

    let nonCQCSite = null;
    it("should create a non-CQC registation", async () => {
        nonCQCSite = registrationUtils.newNonCqcSite(postcodes[2], nonCqcServices);
        const registeredEstablishment = await apiEndpoint.post('/registration')
            .send([nonCQCSite])
            .expect('Content-Type', /json/)
            .expect(200);
        expect(registeredEstablishment.body.status).toEqual(1);
        expect(Number.isInteger(registeredEstablishment.body.establishmentId)).toEqual(true);
    });

    it("should lookup a known username via usernameOrPasswword with success", async () => {
        const knownUsername = nonCQCSite.user.username;
        await apiEndpoint.get('/registration/usernameOrEmail/' + encodeURIComponent(knownUsername))
            .expect(200);
    });
    it("should lookup an unknown username via usernameOrPasswword with not found", async () => {
        const unknownUsername = nonCQCSite.user.username + 'A';
        await apiEndpoint.get('/registration/usernameOrEmail/' + encodeURIComponent(unknownUsername))
            .expect(404);
    });
    it("should lookup a known email via usernameOrPasswword with success", async () => {
        const knownEmail = nonCQCSite.user.emailAddress;
        await apiEndpoint.get('/registration/usernameOrEmail/' + encodeURIComponent(knownEmail))
            .expect(200);
    });
    it("should lookup an unknown email via usernameOrPasswword with not found", async () => {
        const unknownEmail = nonCQCSite.user.emailAddress + 'A';
        await apiEndpoint.get('/registration/usernameOrEmail/' + encodeURIComponent(unknownEmail))
            .expect(404);
    });

    it("should fail to request reset on unknown username with validation err", async () => {
        await apiEndpoint.post('/registration/requestPasswordReset')
            .send({
                usernameOrEmaill: "doesn't matter",
	            ttl: 10
            })
            .expect(400);
    });
    it("should succeed to request reset on unknown username or email", async () => {
        const response = await apiEndpoint.post('/registration/requestPasswordReset')
            .send({
                usernameOrEmail: 'unknown',
	            ttl: 10
            })
            .expect(200);
        expect(response.body).not.toHaveProperty('resetLink');
    });
    it("should succeed to request reset on known username", async () => {
        const response = await apiEndpoint.post('/registration/requestPasswordReset')
            .send({
                usernameOrEmail: nonCQCSite.user.username,
                ttl: 10
            })
            .expect('Content-Type', /json/)
            .expect(200);
        expect(response.body).toHaveProperty('resetLink');
    });
    it("should succeed to request reset on known email", async () => {
        const response = await apiEndpoint.post('/registration/requestPasswordReset')
            .send({
                usernameOrEmail: nonCQCSite.user.emailAddress,
                ttl: 10
            })
            // .expect('Content-Type', /json/)
            // .expect(200);
        expect(response.body).toHaveProperty('resetLink');
        expect(response.body).toHaveProperty('uuid');

        const uuidV4Regex = /^[A-F\d]{8}-[A-F\d]{4}-4[A-F\d]{3}-[89AB][A-F\d]{3}-[A-F\d]{12}$/i;
        expect(uuidV4Regex.test(response.body.uuid)).toEqual(true);
    });

    it("should fail validation on validating password reset", async () => {
        await apiEndpoint.post('/registration/validateResetPassword')
            .send({
                uid: "not a valid attribute name"
            })
            .expect(400);

        // note - the following is not a valid V4 UUID
        await apiEndpoint.post('/registration/validateResetPassword')
            .send({
                uuid: "aaddb3ac-afcd-4795-10c9-2c5a9479c03b"
            })
            .expect(400);
    });
    it("should fail on unknown reset uuid on validating password reset", async () => {
        const randomUuid = uuid.v4();
        await apiEndpoint.post('/registration/validateResetPassword')
            .send({
                uuid: randomUuid
            })
            .expect(404);
    });
    it("should fail on expired token when validating password reset", async () => {
        const reqResponse = await apiEndpoint.post('/registration/requestPasswordReset')
            .send({
                usernameOrEmail: nonCQCSite.user.emailAddress,
                ttl: -10
            })
            .expect('Content-Type', /json/)
            .expect(200);
    
        const resetUuid = reqResponse.body.uuid;
        const validateResponse = await apiEndpoint.post('/registration/validateResetPassword')
            .send({
                uuid: resetUuid
            })
            .expect(403);
    });
    let successfulUuid = null;
    let successfullToken = null;
    it("should return JWT on Authorization header on successfull validating password reset", async () => {
        const reqResponse = await apiEndpoint.post('/registration/requestPasswordReset')
            .send({
                usernameOrEmail: nonCQCSite.user.emailAddress,
                ttl: 100
            })
            .expect('Content-Type', /json/)
            .expect(200);
    
        successfulUuid = reqResponse.body.uuid;
        const validateResponse = await apiEndpoint.post('/registration/validateResetPassword')
            .send({
                uuid: successfulUuid
            })
            .expect(200);

        const JWTbearerRegex = /^Bearer/;
        expect(JWTbearerRegex.test(validateResponse.headers.authorization)).toEqual(true);
        expect(validateResponse.body.username).toEqual(nonCQCSite.user.username);
        expect(validateResponse.body.fullname).toEqual(nonCQCSite.user.fullname);

        successfullToken = validateResponse.headers.authorization;
    });
    it("should not fail on completed token when re-validating password reset", async () => {
        expect(successfulUuid).not.toBeNull();

        await apiEndpoint.post('/registration/validateResetPassword')
            .send({
                uuid: successfulUuid
            })
            .expect(200);
    });

    it("should fail on reset password if no Authorization header given", async () => {
        const passwrdResetResponse = await apiEndpoint.post('/user/resetPassword')
            .send({
                password: "password"
            })
            .expect(401);
    });
    it("should fail on reset password if Authorization header if invalid", async () => {
        // invalid token includes trying to use a login token (fails on aud)
        const loginResponse = await apiEndpoint.post('/login')
            .send({
                username: nonCQCSite.user.username,
                password: nonCQCSite.user.password
            })
            .expect('Content-Type', /json/)
            .expect(200);

        const loginAuthToken = loginResponse.header.authorization;
        await apiEndpoint.post('/user/resetPassword')
            .set('Authorization', loginAuthToken)
            .send({
                password: "password"
            })
            .expect(403);
    });
    
    it("should fail on reset password if no password given", async () => {
        await apiEndpoint.post('/user/resetPassword')
            .set('Authorization', successfullToken)
            .send({
                Password: "password"        // case sensitive
            })
            .expect(400);
    });
    it("should fail on reset password if password given fails validation (strength)", async () => {
        await apiEndpoint.post('/user/resetPassword')
            .set('Authorization', successfullToken)
            .send({
                password: "password"        // password must include one uppercase and one number
            })
            .expect(400);
    });

    let successfulLoginToken = null;
    it("should success on reset password if using a valid token and valid password", async () => {
        expect(successfulUuid).not.toBeNull();

        await apiEndpoint.post('/user/resetPassword')
            .set('Authorization', successfullToken)
            .send({
                password: 'NewPassword00'
            })
            .expect(200);

        // after successful password reset, the reset token should now be invalid
        await apiEndpoint.post('/registration/validateResetPassword')
            .send({
                uuid: successfulUuid
            })
            .expect(401);

        // login using the old password should fail
        await apiEndpoint.post('/login')
            .send({
                username: nonCQCSite.user.username,
                password: nonCQCSite.user.password
            })
            .expect('Content-Type', /json/)
            .expect(401);

        // login using the new password should now work
        const successfulLoginResponse = await apiEndpoint.post('/login')
            .send({
                username: nonCQCSite.user.username,
                password: 'NewPassword00'
            })
            .expect('Content-Type', /json/)
            .expect(200);
        successfulLoginToken = successfulLoginResponse.headers.authorization;
    });

    it("should fail for change password with 401 if no authorization header", async () => {
        await apiEndpoint.post('/user/changePassword')
            .send({
                currentPassword: 'password',
                newPassword: 'new password'
            })
            .expect('Content-Type', /html/)
            .expect(401);
    });
    it("should fail for change password with 403 if no authorisation header is not a valid logged in JWT", async () => {
        expect(successfulUuid).not.toBeNull();

        await apiEndpoint.post('/user/changePassword')
            .set('Authorization', successfullToken)
            .send({
                currentPassword: 'password',
                newPassword: 'new password'
            })
            .expect('Content-Type', /html/)
            .expect(403);
    });

    it("should fail for change password with 400 current/new password is not given", async () => {
        expect(successfulLoginToken).not.toBeNull();

        await apiEndpoint.post('/user/changePassword')
            .set('Authorization', successfulLoginToken)
            .send({
                ccurrentPassword: 'password',
                newPassword: 'new password'
            })
            .expect('Content-Type', /html/)
            .expect(400);

        await apiEndpoint.post('/user/changePassword')
            .set('Authorization', successfulLoginToken)
            .send({
                currentPassword: 'password',
                nnewPassword: 'new password'
            })
            .expect('Content-Type', /html/)
            .expect(400);
    });

    it("should fail for change password with 400 new password is not of required complexity", async () => {
        expect(successfulLoginToken).not.toBeNull();

        // NOTE - there is no checking on history of password used
        // Intentionally not validating complexity of current password
        await apiEndpoint.post('/user/changePassword')
            .set('Authorization', successfulLoginToken)
            .send({
                currentPassword: 'Password00',
                newPassword: 'password'
            })
            .expect('Content-Type', /html/)
            .expect(400);
    });


    it("should fail for change password with 403 if header is good, but current password is incorrect", async () => {
        expect(successfulLoginToken).not.toBeNull();

        await apiEndpoint.post('/user/changePassword')
            .set('Authorization', successfulLoginToken)
            .send({
                currentPassword: 'password',        // should be "NewPassword00" from 'should success on reset password if using a valid token and valid password' test above
                newPassword: 'NewPassword00'
            })
            .expect(403);
    });

    it('should success in changing user\'s password', async () => {
        await apiEndpoint.post('/user/changePassword')
            .set('Authorization', successfulLoginToken)
            .send({
                currentPassword: "NewPassword00",
                newPassword: "Password00"
            })
            .expect('Content-Type', /html/)
            .expect(200);

        // should fail login if using old password
        await apiEndpoint.post('/login')
            .send({
                username: nonCQCSite.user.username,
                password: 'NewPassword00'
            })
            .expect('Content-Type', /json/)
            .expect(401);

        // shoudl pass login if using new passowrd
        await apiEndpoint.post('/login')
            .send({
                username: nonCQCSite.user.username,
                password: 'Password00'
            })
            .expect('Content-Type', /json/)
            .expect(200);
    });
});
