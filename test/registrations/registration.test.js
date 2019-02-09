// this test script runs through a few various different registrations
//  including the catching of duplicate registrations

// mock the general console loggers - removes unnecessary output while running
// global.console = {
//     log: jest.fn(),
//     warn: jest.fn(),
//     error: jest.fn()
// }

const supertest = require('supertest');
const baseEndpoint = require('../utils/baseUrl').baseurl;
const apiEndpoint = supertest(baseEndpoint);

// mocked real postcode/location data
// http://localhost:3000/api/test/locations/random?limit=5
const locations = require('../mockdata/locations').data;
const postcodes = require('../mockdata/postcodes').data;

const registrationUtils = require('../utils/registration');

describe ("Registrations", async () => {
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

    describe("Main Service Lookup Failures", async () => {
        it("should fail for non-CQC site trying to register with CQC service", async () => {
            const registeredEstablishment = await apiEndpoint.post('/registration')
                .send([{
                    locationName: "Warren Care non-CQC",
                    addressLine1: "Line 1",
                    addressLine2: "Line 2 Part 1, Line 2 Part 2",
                    townCity: "My Town",
                    county: "My County",
                    postalCode: "DY10 3RR",
                    mainService: "Nurses agency",           // this is a CQC service
                    isRegulated: false,
                    user: {
                        fullname: "Warren Ayling",
                        jobTitle: "Backend Nurse",
                        emailAddress: "bob@bob.com",
                        contactNumber: "01111 111111",
                        username: "aylingw",
                        password: "password",
                        securityQuestion: "What is dinner?",
                        securityAnswer: "All Day"
                    }
                }])
                .expect('Content-Type', /json/)
                .expect(400);
            expect(registeredEstablishment.body.status).toEqual(-300);
            expect(registeredEstablishment.body.message).toEqual('Unexpected main service id');
        });
        it("should fail for CQC site trying to register with unknown service", async () => {
            const registeredEstablishment = await apiEndpoint.post('/registration')
                .send([{
                    locationId: "1-110055065",
                    locationName: "Warren Care non-CQC",
                    addressLine1: "Line 1",
                    addressLine2: "Line 2 Part 1, Line 2 Part 2",
                    townCity: "My Town",
                    county: "My County",
                    postalCode: "DY10 3RR",
                    mainService: "WOZiTech Nurses",
                    isRegulated: true,
                    user: {
                        fullname: "Warren Ayling",
                        jobTitle: "Backend Nurse",
                        emailAddress: "bob@bob.com",
                        contactNumber: "01111 111111",
                        username: "aylingw",
                        password: "password",
                        securityQuestion: "What is dinner?",
                        securityAnswer: "All Day"
                    }
                }])
                .expect('Content-Type', /json/)
                .expect(400);
            expect(registeredEstablishment.body.status).toEqual(-300);
            expect(registeredEstablishment.body.message).toEqual('Unexpected main service id');
        });
    
    });


    describe.skip("Expected Registrations", async () => {
        it("should create a non-CQC registation", async () => {
            const site =  registrationUtils.newNonCqcSite(postcodes[0], nonCqcServices);
            const registeredEstablishment = await apiEndpoint.post('/registration')
                .send([site])
                .expect('Content-Type', /json/)
                .expect(200);
            expect(registeredEstablishment.body.status).toEqual(1);
            expect(Number.isInteger(registeredEstablishment.body.establishmentId)).toEqual(true);
        });
    
        it("should create a CQC registation", async () => {
            const cqcSite = registrationUtils.newCqcSite(locations[0], cqcServices);
            const registeredEstablishment = await apiEndpoint.post('/registration')
                .send([cqcSite])
                .expect('Content-Type', /json/)
                .expect(200);
            expect(registeredEstablishment.body.status).toEqual(1);
            expect(Number.isInteger(registeredEstablishment.body.establishmentId)).toEqual(true);    
        });    
    });
});