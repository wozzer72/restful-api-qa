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
        // clean the database
        if (process.env.CLEAN_DB) {
            await apiEndpoint.post('/test/clean')
            .send({})
            .expect(200);
        }

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
        await apiEndpoint.get('/registration/usernameOrEmail/' + encodeURI(knownUsername))
            .expect(200);
    });
    it("should lookup an unknown username via usernameOrPasswword with not found", async () => {
        const unknownUsername = nonCQCSite.user.username + 'A';
        await apiEndpoint.get('/registration/usernameOrEmail/' + encodeURI(unknownUsername))
            .expect(404);
    });
    it("should lookup a known email via usernameOrPasswword with success", async () => {
        const knownEmail = nonCQCSite.user.emailAddress;
        await apiEndpoint.get('/registration/usernameOrEmail/' + encodeURI(knownEmail))
            .expect(200);
    });
    it("should lookup an unknown email via usernameOrPasswword with not found", async () => {
        const unknownEmail = nonCQCSite.user.emailAddress + 'A';
        await apiEndpoint.get('/registration/usernameOrEmail/' + encodeURI(unknownEmail))
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
            .expect('Content-Type', /json/)
            .expect(200);
        expect(response.body).toHaveProperty('resetLink');
        expect(response.body).toHaveProperty('uuid');

        const uuidV4Regex = /^[A-F\d]{8}-[A-F\d]{4}-4[A-F\d]{3}-[89AB][A-F\d]{3}-[A-F\d]{12}$/i;
        expect(uuidV4Regex.test(response.body.uuid)).toEqual(true);
    });

    it("it should fail validation on validating password reset", async () => {
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
    it("it should fail on unknown reset uuid on validating password reset", async () => {
        const randomUuid = uuid.v4();
        await apiEndpoint.post('/registration/validateResetPassword')
            .send({
                uuid: randomUuid
            })
            .expect(404);
    });
    it("it should fail on expired token when validating password reset", async () => {
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
    it("it should return JWT on Authorization header on successfull validating password reset", async () => {
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
    });
    it("it should fail on completed token when validating password reset", async () => {
        expect(successfulUuid).not.toBeNull();

        await apiEndpoint.post('/registration/validateResetPassword')
            .send({
                uuid: successfulUuid
            })
            .expect(401);
    });

    it.skip("", async () => {
    });
});