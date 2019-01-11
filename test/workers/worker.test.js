
// this test script runs through a few various different actions on a specific workers (having first registered its own establishments)

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
const postcodes = require('../mockdata/postcodes').data;
const jobs = require('../mockdata/jobs').data;

const Random = require('../utils/random');

const registrationUtils = require('../utils/registration');
const workerUtils = require('../utils/worker');

describe ("worker", async () => {
    let nonCqcServices = null;
    let establishment1 = null;
    let establishment2 = null;
    let establishment1Token = null;
    let establishment2Token = null;

    beforeAll(async () => {
        // clean the database
        if (process.env.CLEAN_DB) {
            await apiEndpoint.post('/test/clean')
            .send({})
            .expect(200);
        }

        // setup reference test data - two establishments
        const nonCqcServicesResults = await apiEndpoint.get('/services/byCategory?cqc=false')
            .expect('Content-Type', /json/)
            .expect(200);
        nonCqcServices = nonCqcServicesResults.body;


        // const site2 =  registrationUtils.newNonCqcSite(postcodes[3], nonCqcServices);
        // establishment1 = await apiEndpoint.post('/registration')
        //     .send([site2])
        //     .expect('Content-Type', /json/)
        //     .expect(200);
    });

    beforeEach(async () => {
    });

    describe("Establishment 1", async ( )=> {
        console.log("Establishment: ", establishment1);
        let establishmentId = null;
        let workerUid = null;

        beforeAll(async () => {
            const site1 =  registrationUtils.newNonCqcSite(postcodes[2], nonCqcServices);
            const site1Response = await apiEndpoint.post('/registration')
                .send([site1])
                .expect('Content-Type', /json/)
                .expect(200);
            establishment1 = site1Response.body;
            establishmentId = establishment1.establishmentId;


            // need to login to get JWT token
            const site1LoginResponse = await apiEndpoint.post('/login')
                .send({
                    username: site1.user.username,
                    password: site1.user.password
                })
                .expect('Content-Type', /json/)
                .expect(200);
            establishment1Token = site1LoginResponse.header.authorization;
        });

        it("should create a Worker", async () => {
            expect(establishment1).not.toBeNull();
            expect(Number.isInteger(establishmentId)).toEqual(true);

            const newWorker = workerUtils.newWorker(jobs);

            const newWorkerResponse = await apiEndpoint.post(`/establishment/${establishmentId}/worker`)
                .set('Authorization', establishment1Token)
                .send(newWorker)
                .expect('Content-Type', /json/)
                .expect(201);

            expect(newWorkerResponse.body.uid).not.toBeNull();
            workerUid = newWorkerResponse.body.uid;

            const uuidRegex = /^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/;
            expect(uuidRegex.test(workerUid.toUpperCase())).toEqual(true);
            
            // proven validation errors
            await apiEndpoint.post(`/establishment/${establishmentId}/worker`)
                .set('Authorization', establishment1Token)
                .send({
                    "nameId" : "Misspelt attribute name - effectively missing",
                    "contract" : "Temporary",
                    "mainJob" : {
                        "jobId" : 12,
                        "title" : "Care Worker"
                    }
                })
                .expect('Content-Type', /html/)
                .expect(400);
            await apiEndpoint.post(`/establishment/${establishmentId}/worker`)
                .set('Authorization', establishment1Token)
                .send({
                    "nameOrId" : "Warren Ayling",
                    "contractt" : "Mispelt",
                    "mainJob" : {
                        "jobId" : 12,
                        "title" : "Care Worker"
                    }
                })
                .expect('Content-Type', /html/)
                .expect(400);
            await apiEndpoint.post(`/establishment/${establishmentId}/worker`)
                .set('Authorization', establishment1Token)
                .send({
                    "nameOrId" : "Warren Ayling",
                    "contract" : "Temporary",
                    "maimnJob" : {
                        "jobId" : 12,
                        "title" : "Misspelt"
                    }
                })
                .expect('Content-Type', /html/)
                .expect(400);
            await apiEndpoint.post(`/establishment/${establishmentId}/worker`)
                .set('Authorization', establishment1Token)
                .send({
                    "nameOrId" : "Warren Ayling",
                    "contract" : "Temporary",
                    "mainJob" : {
                        "jobIId" : 20,
                        "titlee" : "misspelt"
                    }
                })
                .expect('Content-Type', /html/)
                .expect(400);
            await apiEndpoint.post(`/establishment/${establishmentId}/worker`)
                .set('Authorization', establishment1Token)
                .send({
                    "nameOrId" : "Warren Ayling",
                    "contract" : "Temporary",
                    "mainJob" : {
                        "jobId" : 200,
                        "title" : "Out of range"
                    }
                })
                .expect('Content-Type', /html/)
                .expect(400);
            await apiEndpoint.post(`/establishment/${establishmentId}/worker`)
                .set('Authorization', establishment1Token)
                .send({
                    "nameOrId" : "Warren Ayling",
                    "contract" : "Temporary",
                    "mainJob" : {
                        "title" : "Unknown Job Title innit"
                    }
                })
                .expect('Content-Type', /html/)
                .expect(400);
            await apiEndpoint.post(`/establishment/${establishmentId}/worker`)
                .set('Authorization', establishment1Token)
                .send({
                    "nameOrId" : "Warren Ayling",
                    "contract" : "unknown",
                    "mainJob" : {
                        "jobId" : 12,
                        "title" : "Care Worker"
                    }
                })
                .expect('Content-Type', /html/)
                .expect(400);

        });

    });

    describe.skip("Worker forced failures", async () => {
        describe("GET", async () => {
            it("should fail (401) when attempting to fetch worker without passing Authorization header", async () => {});
            it("should fail (403) when attempting to fetch worker passing Authorization header with mismatched establishment id", async () => {});
            it("should fail (403) when attempting to fetch worker not belong to given establishment with id", async () => {});
            it("should fail (503) when attempting to fetch worker with unexpected server error", async () => {});
        });
        describe("POST", async () => {
            it("should fail (401) when attempting to create worker without passing Authorization header", async () => {});
            it("should fail (403) when attempting to create workter passing Authorization header with mismatched establishment id", async () => {});
            it("should fail (503) when attempting to create worker with unexpected server error", async () => {});
            it("should fail (409) when attempting to create worker with duplicate name/id for the same establishment", async () => {});
        });
        describe("PUT", async () => {
            it("should fail (401) when attempting to update worker without passing Authorization header", async () => {});
            it("should fail (403) when attempting to update worker passing Authorization header with mismatched establishment id", async () => {});
            it("should fail (403) when attempting to update worker not belong to given establishment with id", async () => {});
            it("should fail (503) when attempting to update worker with unexpected server error", async () => {});
        });
        describe("DELETE", async () => {
            it("should fail (401) when attempting to delete worker without passing Authorization header", async () => {});
            it("should fail (403) when attempting to delete worker passing Authorization header with mismatched establishment id", async () => {});
            it("should fail (403) when attempting to delete worker not belong to given establishment with id", async () => {});
            it("should fail (503) when attempting to delete worker with unexpected server error", async () => {});
        });
    });

});