
// this test script runs through a few various different actions on a specific workers (having first registered its own establishments)

// mock the general console loggers - removes unnecessary output while running
// global.console = {
//     log: jest.fn(),
//     warn: jest.fn(),
//     error: jest.fn()
// }

const supertest = require('supertest');
const uuid = require('uuid');
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


            // incorrect establishment id and worker facts
            const unknownEstablishmentId = 1723785475876865;
            await apiEndpoint.post(`/establishment/${unknownEstablishmentId}/worker`)
                .set('Authorization', establishment1Token)
                .send({})
                .expect('Content-Type', /html/)
                .expect(403);
            await apiEndpoint.post(`/establishment/${unknownEstablishmentId}/worker`)
                //.set('Authorization', establishment1Token)
                .send({})
                .expect('Content-Type', /html/)
                .expect(401);            
        });

        it("should update a Worker", async () => {
            expect(establishment1).not.toBeNull();
            expect(workerUid).not.toBeNull();

            const updatedWorkerResponse = await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    "nameOrId" : "Updated Worker Name",
                    "contract" : "Pool/Bank",
                    "mainJob" : {
                        "jobId" : 19
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);

            expect(updatedWorkerResponse.body.uid).not.toBeNull();
            expect(updatedWorkerResponse.body.uid).toEqual(workerUid);

            // successful updates of each property at a time
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    "nameOrId" : "Updated Worker Name"
                })
                .expect('Content-Type', /json/)
                .expect(200);
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    "contract" : "Pool/Bank"
                })
                .expect('Content-Type', /json/)
                .expect(200);
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    "mainJob" : {
                        "jobId" : 19
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);
            // NOTE - the approvedMentalHealthWorker options are case sensitive (know!)
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    "approvedMentalHeathWorker" : "Don't know"
                })
                .expect('Content-Type', /json/)
                .expect(200);
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({})
                .expect('Content-Type', /json/)
                .expect(200);

            // proven validation errors
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    "nameOrId" : "ten nine \"eight\" seven 6543210 (!'£$%^&*) \\ special"
                })
                .expect('Content-Type', /html/)
                .expect(400);
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    "contract" : "Undefined"
                })
                .expect('Content-Type', /html/)
                .expect(400);
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    "mainJob" : {
                        "jobId" : 32,
                        "title" : "Out of range"
                    }
                })
                .expect('Content-Type', /html/)
                .expect(400);
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    "approvedMentalHeathWorker" : "Undefined"
                })
                .expect('Content-Type', /html/)
                .expect(400);

            // incorrect establishment id and worker facts
            const unknownUuid = uuid.v4();
            const unknownEstablishmentId = 1723785475876865;
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${unknownUuid}`)
                .set('Authorization', establishment1Token)
                .send({})
                .expect('Content-Type', /html/)
                .expect(404);
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/2f8bd309-2a3e`)
                .set('Authorization', establishment1Token)
                .send({})
                .expect('Content-Type', /html/)
                .expect(400);
            await apiEndpoint.put(`/establishment/${unknownEstablishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({})
                .expect('Content-Type', /html/)
                .expect(403);
            await apiEndpoint.put(`/establishment/${unknownEstablishmentId}/worker/${workerUid}`)
                //.set('Authorization', establishment1Token)
                .send({})
                .expect('Content-Type', /html/)
                .expect(401);            

        });

        let allWorkers = null;
        let secondWorkerInput = null;
        let secondWorker = null;
        it("should return a list of Workers", async () => {
            expect(establishment1).not.toBeNull();
            expect(Number.isInteger(establishmentId)).toEqual(true);

            // create another two worker
            secondWorkerInput = workerUtils.newWorker(jobs);
            const secondWorkerResponse = await apiEndpoint.post(`/establishment/${establishmentId}/worker`)
                .set('Authorization', establishment1Token)
                .send(secondWorkerInput)
                .expect('Content-Type', /json/)
                .expect(201);
            secondWorker = { ...secondWorkerInput, ...secondWorkerResponse.body };
            await apiEndpoint.post(`/establishment/${establishmentId}/worker`)
                .set('Authorization', establishment1Token)
                .send(workerUtils.newWorker(jobs))
                .expect('Content-Type', /json/)
                .expect(201);

            // should now have three (one from previous test)
            const allWorkersResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);

            expect(allWorkersResponse.body.workers).not.toBeNull();
            expect(Array.isArray(allWorkersResponse.body.workers)).toEqual(true);
            expect(allWorkersResponse.body.workers.length).toEqual(3);

            allWorkers = allWorkersResponse.body.workers;
        });

        it("should fetch a single worker", async () => {
            console.log("TEST DEBUG: second worker: ", secondWorker)

            expect(secondWorker).not.toBeNull();
            const uuidRegex = /^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/;
            expect(uuidRegex.test(secondWorker.uid.toUpperCase())).toEqual(true);

            const fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${secondWorker.uid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);

            expect(fetchedWorkerResponse.body.uid).toEqual(secondWorker.uid);
            expect(fetchedWorkerResponse.body.contract).toEqual(secondWorker.contract);
            expect(fetchedWorkerResponse.body.mainJob.jobId).toEqual(secondWorker.mainJob.jobId);
            expect(fetchedWorkerResponse.body.mainJob.title).toEqual(secondWorker.mainJob.title);
            expect(fetchedWorkerResponse.body.created).not.toBeNull();

            const currentEpoch = new Date().getTime();
            const createdEpoch = new Date(fetchedWorkerResponse.body.created).getTime();
            expect(currentEpoch-createdEpoch).toBeLessThan(1000);   // within the last 1 second
            expect(fetchedWorkerResponse.body.updated).not.toBeNull();
            const updatedEpoch = new Date(fetchedWorkerResponse.body.updated).getTime();
            expect(currentEpoch-updatedEpoch).toBeLessThan(1000);   // within the last 1 second

            // check for validation errors
            const unknownUuid = uuid.v4();
            const unknownEstablishmentId = 1723785475876865;
            // unknown
            await apiEndpoint.get(`/establishment/${establishmentId}/worker/${unknownUuid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /html/)
                .expect(404);
            // dodgy UUID input
            await apiEndpoint.get(`/establishment/${establishmentId}/worker/2f8bd309-2a3e`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /html/)
                .expect(400);
            // mismatched establishment id
            await apiEndpoint.get(`/establishment/${unknownEstablishmentId}/worker/${secondWorker.uid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /html/)
                .expect(403);
            // missing authentication header
            await apiEndpoint.get(`/establishment/${unknownEstablishmentId}/worker/${secondWorker.uid}`)
                .expect('Content-Type', /html/)
                .expect(401);
        });

    });

    describe.skip("Worker forced failures", async () => {
        describe("GET", async () => {
            it("should fail (503) when attempting to fetch worker with unexpected server error", async () => {});
            it("should fail (404) when attempting to fetch worker with establishment id no longer exists (but JWT token still valid)", async () => {});
        });
        describe("POST", async () => {
            it("should fail (503) when attempting to create worker with unexpected server error", async () => {});
            it("should fail (409) when attempting to create worker with duplicate name/id for the same establishment", async () => {});
            it("should fail (404) when attempting to create worker with establishment id no longer exists (but JWT token still valid)", async () => {});
        });
        describe("PUT", async () => {
            it("should fail (503) when attempting to update worker with unexpected server error", async () => {});
            it("should fail (404) when attempting to update worker with establishment id no longer exists (but JWT token still valid)", async () => {});
        });
        describe("DELETE", async () => {
            it("should fail (401) when attempting to delete worker without passing Authorization header", async () => {});
            it("should fail (403) when attempting to delete worker passing Authorization header with mismatched establishment id", async () => {});
            it("should fail (403) when attempting to delete worker not belong to given establishment with id", async () => {});
            it("should fail (503) when attempting to delete worker with unexpected server error", async () => {});
            it("should fail (404) when attempting to delete worker with establishment id no longer exists (but JWT token still valid)", async () => {});
        });
    });

});