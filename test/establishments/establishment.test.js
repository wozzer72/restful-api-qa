// this test script runs through a few various different actions on a specific establishment (registers its own establishment)

// mock the general console loggers - removes unnecessary output while running
// global.console = {
//     log: jest.fn(),
//     warn: jest.fn(),
//     error: jest.fn()
// }

const supertest = require('supertest');
const faker = require('faker');
const baseEndpoint = 'http://localhost:3000/api';
const apiEndpoint = supertest(baseEndpoint);

// mocked real postcode/location data
// http://localhost:3000/api/test/locations/random?limit=5
const locations = require('../mockdata/locations').data;
const postcodes = require('../mockdata/postcodes').data;

const registrationUtils = require('../utils/registration');

describe ("establishment", async () => {
    let cqcServices = null;
    let nonCqcServices = null;
    beforeAll(async () => {
        // clean the database
        if (process.env.CLEAN_DB) {
            await apiEndpoint.post('/test/clean')
            .send({})
            .expect(200);
        }

        // fetch the current set of CQC and non CQC services (to set main service)
        const cqcServicesResults = await apiEndpoint.get('/services/byCategory?cqc=true')
            .expect('Content-Type', /json/)
            .expect(200);
        cqcServices = cqcServicesResults.body;
            
        const nonCqcServicesResults = await apiEndpoint.get('/services/byCategory?cqc=false')
            .expect('Content-Type', /json/)
            .expect(200);
        nonCqcServices = nonCqcServicesResults.body;
    });

    beforeEach(async () => {
    });

    describe("Non CQC Establishment", async ( )=> {
        let site = null;
        let establishmentId = null;
        let loginSuccess = null;
        let authToken = null;

        beforeAll(async () => {
            site =  registrationUtils.newNonCqcSite(postcodes[1], nonCqcServices);
        });

        it("should create a non-CQC registation", async () => {
            expect(site).not.toBeNull();

            const nonCqcEstablishment = await apiEndpoint.post('/registration')
                .send([site])
                .expect('Content-Type', /json/)
                .expect(200);

            expect(nonCqcEstablishment.body.success).toEqual(1);
            expect(Number.isInteger(nonCqcEstablishment.body.establishmentId)).toEqual(true);
            establishmentId = nonCqcEstablishment.body.establishmentId;
        });

        it("should login using the given username", async () => {
            expect(establishmentId).not.toBeNull();

            // first login after registration
            const loginResponse = await apiEndpoint.post('/login')
                .send({
                    username: site.user.username,
                    password: 'password'
                })
                .expect('Content-Type', /json/)
                .expect(200);

            expect(loginResponse.body.establishment.id).toEqual(establishmentId);
            expect(loginResponse.body.establishment.isRegulated).toEqual(false);
            expect(loginResponse.body.isFirstLogin).toEqual(true);
            expect(Number.isInteger(loginResponse.body.mainService.id)).toEqual(true);

            // login a second time and confirm revised firstLogin status
            const secondLoginResponse = await apiEndpoint.post('/login')
                .send({
                    username: site.user.username,
                    password: 'password'
                })
                .expect('Content-Type', /json/)
                .expect(200);
            expect(secondLoginResponse.body.isFirstLogin).toEqual(false);
            expect(secondLoginResponse.body.establishment.name).toEqual(site.locationName);
            expect(secondLoginResponse.body.mainService.name).toEqual(site.mainService);

            loginSuccess = secondLoginResponse.body;
            
            // assert and store the auth token
            authToken = parseInt(secondLoginResponse.header.authorization);
            expect(authToken).toEqual(establishmentId);
        });

        it("should update the employer type", async () => {
            expect(authToken).not.toBeNull();
            expect(establishmentId).not.toBeNull();

            const firstResponse = await apiEndpoint.get(`/establishment/${establishmentId}/employerType`)
                .set('Authorization', authToken)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(firstResponse.body.id).toEqual(establishmentId);
            expect(firstResponse.body.name).toEqual(site.locationName);
            expect(firstResponse.body.employerType).toBeNull();

            let updateResponse = await apiEndpoint.post(`/establishment/${establishmentId}/employerType`)
                .set('Authorization', authToken)
                .send({
                    employerType : "Private Sector"
                })
                .expect('Content-Type', /json/)
                .expect(200);
            expect(updateResponse.body.id).toEqual(establishmentId);
            expect(updateResponse.body.name).toEqual(site.locationName);
            expect(updateResponse.body.employerType).toEqual('Private Sector');

            const secondResponse = await apiEndpoint.get(`/establishment/${establishmentId}/employerType`)
                .set('Authorization', authToken)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(secondResponse.body.id).toEqual(establishmentId);
            expect(secondResponse.body.name).toEqual(site.locationName);
            expect(secondResponse.body.employerType).toEqual('Private Sector');

            updateResponse = await apiEndpoint.post(`/establishment/${establishmentId}/employerType`)
                .set('Authorization', authToken)
                .send({
                    employerType : "Voluntary / Charity"
                })
                .expect('Content-Type', /json/)
                .expect(200);
            expect(updateResponse.body.employerType).toEqual('Voluntary / Charity');
            updateResponse = await apiEndpoint.post(`/establishment/${establishmentId}/employerType`)
                .set('Authorization', authToken)
                .send({
                    employerType : "Other"
                })
                .expect('Content-Type', /json/)
                .expect(200);
            expect(updateResponse.body.employerType).toEqual('Other');

            // now test for an unexpected employer type
            apiEndpoint.post(`/establishment/${establishmentId}/employerType`)
                .set('Authorization', authToken)
                .send({
                    employerType : "Unknown"
                })
                .expect('Content-Type', /text/)
                .expect(400)
                .end((err,res) => {
                    expect(res.text).toEqual('Unexpected employer type: Unknown');
                    expect(res.error.status).toEqual(400);
                });
            
        });
    });

    describe("CQC Establishment", async ( )=> {
        // it("should create a CQC registation", async () => {
        //     const cqcSite = registrationUtils.newCqcSite(locations[0], cqcServices);
        //     apiEndpoint.post('/registration')
        //         .send([cqcSite])
        //         .expect('Content-Type', /json/)
        //         .expect(200)
        //         .end((err, res) => {
        //             if (err) {
        //                 console.error(err);
        //             }
        //             console.log(res.body);
        //     });
        // });
    });

});