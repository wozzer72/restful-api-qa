// this test script runs through a few various different registrations
//  including the catching of duplicate registrations

// mock the general console loggers - removes unnecessary output while running
// global.console = {
//     log: jest.fn(),
//     warn: jest.fn(),
//     error: jest.fn()
// }

const supertest = require('supertest');
const baseEndpoint = 'http://localhost:3000/api';
const apiEndpoint = supertest(baseEndpoint);

// mocked real postcode/location data
// http://localhost:3000/api/test/locations/random?limit=5
const locations = require('../mockdata/locations').data;
const postcodes = require('../mockdata/postcodes').data;

const registrationUtils = require('../utils/registration');

describe ("Expected registrations", async () => {
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

    it("should create a non-CQC registation", async () => {
        const site =  registrationUtils.newNonCqcSite(postcodes[0], nonCqcServices);
        const registeredEstablishment = await apiEndpoint.post('/registration')
            .send([site])
            .expect('Content-Type', /json/)
            .expect(200);
        expect(registeredEstablishment.body.success).toEqual(1);
        expect(Number.isInteger(registeredEstablishment.body.establishmentId)).toEqual(true);
    });

    it("should create a CQC registation", async () => {
        const cqcSite = registrationUtils.newCqcSite(locations[0], cqcServices);
        const registeredEstablishment = await apiEndpoint.post('/registration')
            .send([cqcSite])
            .expect('Content-Type', /json/)
            .expect(200);
        expect(registeredEstablishment.body.success).toEqual(1);
        expect(Number.isInteger(registeredEstablishment.body.establishmentId)).toEqual(true);    
    });
});