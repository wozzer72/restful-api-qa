
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
const ethnicities = require('../mockdata/ethnicity').data;
const nationalities = require('../mockdata/nationalities').data;
const countries = require('../mockdata/countries').data;
const recruitedOrigins = require('../mockdata/recruitedFrom').data;
const qualifications = require('../mockdata/qualifications').data;

const Random = require('../utils/random');

const registrationUtils = require('../utils/registration');
const workerUtils = require('../utils/worker');
const ethnicityUtils = require('../utils/ethnicity');
const nationalityUtils = require('../utils/nationalities');
const countryUtils = require('../utils/countries');
const qualificationUtils = require('../utils/qualifications');
const recruitedFromUtils = require('../utils/recruitedFrom');

const validatePropertyChangeHistory = (property, currentValue, previousValue, username, requestEpoch, compareFunction) => {
    /* eg.
    { currentValue: 'et updated',
      lastSavedBy: 'Amalia_Bechtelar11',
      lastChangedBy: 'Amalia_Bechtelar11',
      lastSaved: '2019-01-22T14:23:42.225Z',
      lastChanged: '2019-01-22T14:23:42.225Z',
      changeHistory:
       [ { username: 'Amalia_Bechtelar11',
           when: '2019-01-22T14:23:42.236Z',
           event: 'changed',
           change: [Object] },
         { username: 'Amalia_Bechtelar11',
           when: '2019-01-22T14:23:42.236Z',
           event: 'saved' },
         { username: 'Amalia_Bechtelar11',
           when: '2019-01-22T14:23:42.079Z',
           event: 'saved' }
       ]
    }
    */

    expect(compareFunction(property.currentValue, currentValue)).toEqual(true);
    expect(Math.abs(new Date(property.lastSaved).getTime() - requestEpoch)).toBeLessThan(500);
    expect(Math.abs(new Date(property.lastChanged).getTime() - requestEpoch)).toBeLessThan(500);
    expect(property.lastSavedBy).toEqual(username);
    expect(property.lastChangedBy).toEqual(username);

    const changeHistory = property.changeHistory;
    expect(Array.isArray(changeHistory)).toEqual(true);
    expect(changeHistory.length).toEqual(3);
    expect(changeHistory[0].username).toEqual(username);
    expect(changeHistory[1].username).toEqual(username);
    expect(changeHistory[2].username).toEqual(username);
    expect(Math.abs(new Date(changeHistory[0].when).getTime() - requestEpoch)).toBeLessThan(500);
    expect(Math.abs(new Date(changeHistory[1].when).getTime() - requestEpoch)).toBeLessThan(500);
    expect(Math.abs(new Date(changeHistory[2].when).getTime() - requestEpoch)).toBeLessThan(1000);
    expect(changeHistory[0].event).toEqual('changed');
    expect(changeHistory[1].event).toEqual('saved');
    expect(changeHistory[2].event).toEqual('saved');

    // validate the change event before and after property values
    expect(compareFunction(changeHistory[0].change.new, currentValue)).toEqual(true);
    expect(compareFunction(changeHistory[0].change.current, previousValue)).toEqual(true);
};

describe ("worker", async () => {
    let nonCqcServices = null;
    let establishment1 = null;
    let establishment2 = null;
    let establishment1Token = null;
    let establishment2Token = null;
    let establishment1Username = null;
    let establishment2Username = null;

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
            establishment1Username = site1.user.username;
        });

        let newWorker = null;
        it("should create a Worker", async () => {
            expect(establishment1).not.toBeNull();
            expect(Number.isInteger(establishmentId)).toEqual(true);

            newWorker = workerUtils.newWorker(jobs);
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

        it("should update a Worker's mandatory properties", async () => {
            expect(establishment1).not.toBeNull();
            expect(workerUid).not.toBeNull();

            const updatedNameId = newWorker.nameOrId + " updated";
            const updatedContract = newWorker.contract == "Agency" ? "Permanent" : "Agency";
            const updatedJobId = newWorker.mainJob.jobId == 20 ? 19 : 20;
            const updatedWorkerResponse = await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    "nameOrId" : updatedNameId,
                    "contract" : updatedContract,
                    "mainJob" : {
                        "jobId" : updatedJobId
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);

            expect(updatedWorkerResponse.body.uid).not.toBeNull();
            expect(updatedWorkerResponse.body.uid).toEqual(workerUid);

            let requestEpoch = new Date().getTime();
            let workerChangeHistory =  await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}?history=full`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);

            let updatedEpoch = new Date(workerChangeHistory.body.updated).getTime();
            expect(Math.abs(requestEpoch-updatedEpoch)).toBeLessThan(500);   // allows for slight clock slew

            validatePropertyChangeHistory(workerChangeHistory.body.nameOrId,
                                          updatedNameId,
                                          newWorker.nameOrId,
                                          establishment1Username,
                                          requestEpoch,
                                          (ref, given) => {
                                            return ref == given
                                          });
            validatePropertyChangeHistory(workerChangeHistory.body.contract,
                updatedContract,
                newWorker.contract,
                establishment1Username,
                requestEpoch,
                (ref, given) => {
                  return ref == given
                });
            validatePropertyChangeHistory(workerChangeHistory.body.mainJob,
                    updatedJobId,
                    newWorker.mainJob.jobId,
                    establishment1Username,
                    requestEpoch,
                    (ref, given) => {
                      //console.log("TEST DEBUG: main job: ref/given: ", ref, given)
                      return ref.jobId == given
                    });

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
                    "contract" : "Temporary"
                })
                .expect('Content-Type', /json/)
                .expect(200);
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    "contract" : "Agency"
                })
                .expect('Content-Type', /json/)
                .expect(200);
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    "contract" : "Other"
                })
                .expect('Content-Type', /json/)
                .expect(200);
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    "contract" : "Permanent"
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

        it("should update a Worker's Approved Mental Health Worker property", async () => {
            // NOTE - the approvedMentalHealthWorker options are case sensitive (know!)
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    "approvedMentalHealthWorker" : "Don't know"
                })
                .expect('Content-Type', /json/)
                .expect(200);
            let fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.approvedMentalHealthWorker).toEqual("Don't know");

            // update once with change
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    "approvedMentalHealthWorker" : "Yes"
                })
                .expect('Content-Type', /json/)
                .expect(200);

            fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.approvedMentalHealthWorker).toEqual("Yes");

            // now test change history
            let requestEpoch = new Date().getTime();
            let workerChangeHistory =  await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}?history=full`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            let updatedEpoch = new Date(workerChangeHistory.body.updated).getTime();
            expect(Math.abs(requestEpoch-updatedEpoch)).toBeLessThan(500);   // allows for slight clock slew

            validatePropertyChangeHistory(workerChangeHistory.body.approvedMentalHealthWorker,
                                            "Yes",
                                            "Don't know",
                                            establishment1Username,
                                            requestEpoch,
                                            (ref, given) => {
                                                return ref == given
                                            });

            apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    "approvedMentalHealthWorker" : "No"
                })
                .expect('Content-Type', /json/)
                .expect(200);

            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    "approvedMentalHealthWorker" : "Undefined"
                })
                .expect('Content-Type', /html/)
                .expect(400);
        });

        it("should update a Worker's Main Job Start Date property", async () => {
            // NOTE - the approvedMentalHealthWorker options are case sensitive (know!)
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    "mainJobStartDate" : "2019-01-15"
                })
                .expect('Content-Type', /json/)
                .expect(200);
            const fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.mainJobStartDate).toEqual("2019-01-15");

            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    "mainJobStartDate" : "2019-01-14"
                })
                .expect('Content-Type', /json/)
                .expect(200);

            // now test change history
            let requestEpoch = new Date().getTime();
            let workerChangeHistory =  await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}?history=full`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            let updatedEpoch = new Date(workerChangeHistory.body.updated).getTime();
            expect(Math.abs(requestEpoch-updatedEpoch)).toBeLessThan(500);   // allows for slight clock slew

            validatePropertyChangeHistory(workerChangeHistory.body.mainJobStartDate,
                                            "2019-01-14",
                                            "2019-01-15",
                                            establishment1Username,
                                            requestEpoch,
                                            (ref, given) => {
                                                return ref == given
                                            });

            const tomorrow = new Date();
            tomorrow.setDate(new Date().getDate()+1);
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    "mainJobStartDate" : tomorrow.toISOString().slice(0,10)
                })
                .expect('Content-Type', /html/)
                .expect(400);
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    "mainJobStartDate" : "2018-02-29"
                })
                .expect('Content-Type', /html/)
                .expect(400);
        });

        it("should update a Worker's NI Number property", async () => {
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    "nationalInsuranceNumber" : "NY 21 26 12 A"
                })
                .expect('Content-Type', /json/)
                .expect(200);
            const fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.nationalInsuranceNumber).toEqual("NY 21 26 12 A");

            // now test change history
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    "nationalInsuranceNumber" : "NY 21 26 12 B"
                })
                .expect('Content-Type', /json/)
                .expect(200);

            let requestEpoch = new Date().getTime();
            let workerChangeHistory =  await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}?history=full`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            let updatedEpoch = new Date(workerChangeHistory.body.updated).getTime();
            expect(Math.abs(requestEpoch-updatedEpoch)).toBeLessThan(500);   // allows for slight clock slew

            validatePropertyChangeHistory(workerChangeHistory.body.nationalInsuranceNumber,
                                            "NY 21 26 12 B",
                                            "NY 21 26 12 A",
                                            establishment1Username,
                                            requestEpoch,
                                            (ref, given) => {
                                                return ref == given
                                            });            

            // "NI" is not a valid prefix for a NI Number.
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    "nationalInsuranceNumber" : "NI 21 26 12 A"
                })
                .expect('Content-Type', /html/)
                .expect(400);
            // NI is more than 13 characters
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    "mainJobStartDate" : "NY   21 26  12 A"
                })
                .expect('Content-Type', /html/)
                .expect(400);
        });

        it("should update a Worker's DOB property", async () => {
            // NOTE - the approvedMentalHealthWorker options are case sensitive (know!)
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    "dateOfBirth" : "1994-01-15"
                })
                .expect('Content-Type', /json/)
                .expect(200);
            const fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.dateOfBirth).toEqual("1994-01-15");

            // now test change history
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    "dateOfBirth" : "1994-01-16"
                })
                .expect('Content-Type', /json/)
                .expect(200);

            let requestEpoch = new Date().getTime();
            let workerChangeHistory =  await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}?history=full`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            let updatedEpoch = new Date(workerChangeHistory.body.updated).getTime();
            expect(Math.abs(requestEpoch-updatedEpoch)).toBeLessThan(500);   // allows for slight clock slew

            validatePropertyChangeHistory(workerChangeHistory.body.dateOfBirth,
                                            "1994-01-16",
                                            "1994-01-15",
                                            establishment1Username,
                                            requestEpoch,
                                            (ref, given) => {
                                                return ref == given
                                            });

            // 1994 is not a leap year, so there are only 28 days in Feb
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    "dateOfBirth" : "1994-02-29"
                })
                .expect('Content-Type', /html/)
                .expect(400);
            
            const tenYearsAgo = new Date();
            tenYearsAgo.setDate(new Date().getDate()-(10*366));
            const childLabourResponse = await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    "dateOfBirth" : tenYearsAgo.toISOString().slice(0,10)
                })
                .expect('Content-Type', /html/)
                .expect(400);
        });

        it("should update a Worker's postcode property", async () => {
            // NOTE - the approvedMentalHealthWorker options are case sensitive (know!)
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    "postcode" : "SE13 7SN"
                })
                .expect('Content-Type', /json/)
                .expect(200);
            const fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.postcode).toEqual("SE13 7SN");

            // now test change history
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    "postcode" : "SE13 7SS"
                })
                .expect('Content-Type', /json/)
                .expect(200);

            let requestEpoch = new Date().getTime();
            let workerChangeHistory =  await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}?history=full`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            let updatedEpoch = new Date(workerChangeHistory.body.updated).getTime();
            expect(Math.abs(requestEpoch-updatedEpoch)).toBeLessThan(500);   // allows for slight clock slew

            validatePropertyChangeHistory(workerChangeHistory.body.postcode,
                                            "SE13 7SS",
                                            "SE13 7SN",
                                            establishment1Username,
                                            requestEpoch,
                                            (ref, given) => {
                                                return ref == given
                                            });

            // 1994 is not a leap year, so there are only 28 days in Feb
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    "postcode" : "SE13 7S"
                })
                .expect('Content-Type', /html/)
                .expect(400);
        });

        it("should update a Worker's gender", async () => {
            // NOTE - the gender options are case sensitive (know!); test all expected options
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    "gender" : "Male"
                })
                .expect('Content-Type', /json/)
                .expect(200);
            let fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.gender).toEqual("Male");
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    "gender" : "Female"
                })
                .expect('Content-Type', /json/)
                .expect(200);

            // now test change history
            let requestEpoch = new Date().getTime();
            let workerChangeHistory =  await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}?history=full`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            let updatedEpoch = new Date(workerChangeHistory.body.updated).getTime();
            expect(Math.abs(requestEpoch-updatedEpoch)).toBeLessThan(500);   // allows for slight clock slew

            validatePropertyChangeHistory(workerChangeHistory.body.gender,
                                            "Female",
                                            "Male",
                                            establishment1Username,
                                            requestEpoch,
                                            (ref, given) => {
                                                return ref == given
                                            });

            fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.gender).toEqual("Female");
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    "gender" : "Other"
                })
                .expect('Content-Type', /json/)
                .expect(200);
            fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.gender).toEqual("Other");
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    "gender" : "Don't know"
                })
                .expect('Content-Type', /json/)
                .expect(200);
            fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.gender).toEqual("Don't know");

            // 1994 is not a leap year, so there are only 28 days in Feb
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    "gender" : "unknown"
                })
                .expect('Content-Type', /html/)
                .expect(400);
        });

        it("should update a Worker's disability", async () => {
            // NOTE - the gender options are case sensitive (know!); test all expected options
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    "disability" : "Yes"
                })
                .expect('Content-Type', /json/)
                .expect(200);
            let fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.disability).toEqual("Yes");
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    "disability" : "No"
                })
                .expect('Content-Type', /json/)
                .expect(200);

            // now test change history
            let requestEpoch = new Date().getTime();
            let workerChangeHistory =  await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}?history=full`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            let updatedEpoch = new Date(workerChangeHistory.body.updated).getTime();
            expect(Math.abs(requestEpoch-updatedEpoch)).toBeLessThan(500);   // allows for slight clock slew

            validatePropertyChangeHistory(workerChangeHistory.body.disability,
                                            "No",
                                            "Yes",
                                            establishment1Username,
                                            requestEpoch,
                                            (ref, given) => {
                                                return ref == given
                                            });
            
            fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.disability).toEqual("No");
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    "disability" : "Undisclosed"
                })
                .expect('Content-Type', /json/)
                .expect(200);
            fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.disability).toEqual("Undisclosed");
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    "disability" : "Don't know"
                })
                .expect('Content-Type', /json/)
                .expect(200);
            fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.disability).toEqual("Don't know");

            // 1994 is not a leap year, so there are only 28 days in Feb
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    "disability" : "Other"
                })
                .expect('Content-Type', /html/)
                .expect(400);
        });

        it("should update a Worker's ethnicity", async () => {
            const randomEthnicity = ethnicityUtils.lookupRandomEthnicity(ethnicities);

            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    ethnicity : {
                        ethnicityId: randomEthnicity.id
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);
            let fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.ethnicity.ethnicityId).toEqual(randomEthnicity.id);
            expect(fetchedWorkerResponse.body.ethnicity.ethnicity).toEqual(randomEthnicity.ethnicity);

            const secondEthnicity = randomEthnicity.id == 11 ? 12 : 11;
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    ethnicity : {
                        ethnicityId: secondEthnicity
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);

            // now test change history
            let requestEpoch = new Date().getTime();
            let workerChangeHistory =  await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}?history=full`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            let updatedEpoch = new Date(workerChangeHistory.body.updated).getTime();
            expect(Math.abs(requestEpoch-updatedEpoch)).toBeLessThan(500);   // allows for slight clock slew

            validatePropertyChangeHistory(workerChangeHistory.body.ethnicity,
                                            secondEthnicity,
                                            randomEthnicity.id,
                                            establishment1Username,
                                            requestEpoch,
                                            (ref, given) => {
                                                return ref.ethnicityId == given
                                            });

            // update ethnicity by name
            const secondRandomEthnicity = ethnicityUtils.lookupRandomEthnicity(ethnicities);
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    ethnicity : {
                        ethnicity: secondRandomEthnicity.ethnicity
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);
            fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.ethnicity.ethnicityId).toEqual(secondRandomEthnicity.id);
            expect(fetchedWorkerResponse.body.ethnicity.ethnicity).toEqual(secondRandomEthnicity.ethnicity);

            // out of range ethnicity id
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    ethnicity : {
                        ethnicityId: 100
                    }
                })
                .expect('Content-Type', /html/)
                .expect(400);
            // unknown ethnicity (by name)
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    ethnicity : {
                        ethnicity: "UnKnown"
                    }
                })
                .expect('Content-Type', /html/)
                .expect(400);
        });

        it("should update a Worker's qualifications", async () => {
            const randomQualification = qualificationUtils.lookupRandomQualification(qualifications);

            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    qualification : {
                        qualificationId : randomQualification.id
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);
            let fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.qualification.qualificationId).toEqual(randomQualification.id);
            expect(fetchedWorkerResponse.body.qualification.title).toEqual(randomQualification.level);

            const secondQualification = randomQualification.id == 2 ? 12 : 2;
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    qualification : {
                        qualificationId: secondQualification
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);

            // now test change history
            let requestEpoch = new Date().getTime();
            let workerChangeHistory =  await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}?history=full`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            let updatedEpoch = new Date(workerChangeHistory.body.updated).getTime();
            expect(Math.abs(requestEpoch-updatedEpoch)).toBeLessThan(500);   // allows for slight clock slew

            validatePropertyChangeHistory(workerChangeHistory.body.qualification,
                                            secondQualification,
                                            randomQualification.id,
                                            establishment1Username,
                                            requestEpoch,
                                            (ref, given) => {
                                                return ref.qualificationId == given
                                            });

            // update qualification by name
            const secondRandomQualification = qualificationUtils.lookupRandomQualification(qualifications);
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    qualification : {
                        title: secondRandomQualification.level
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);
            fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.qualification.qualificationId).toEqual(secondRandomQualification.id);
            expect(fetchedWorkerResponse.body.qualification.title).toEqual(secondRandomQualification.level);

            // out of range qualification id
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    qualification : {
                        qualificationId: 100
                    }
                })
                .expect('Content-Type', /html/)
                .expect(400);
            // unknown qualification (by name)
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    qualification : {
                        title: "UnKnown"
                    }
                })
                .expect('Content-Type', /html/)
                .expect(400);
        });


        it("should update a Worker's nationality", async () => {
            const randomNationality = nationalityUtils.lookupRandomNationality(nationalities);

            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    nationality : {
                        value : "Other",
                        other : {
                            nationalityId : randomNationality.id
                        }
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);
            let fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.nationality.other.nationalityId).toEqual(randomNationality.id);
            expect(fetchedWorkerResponse.body.nationality.other.nationality).toEqual(randomNationality.nationality);

            const secondNationality = randomNationality.id == 222 ? 111 : 222;
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    nationality : {
                        value : "Other",
                        other : {
                            nationalityId : secondNationality
                        }
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);

            // now test change history
            let requestEpoch = new Date().getTime();
            let workerChangeHistory =  await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}?history=full`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            let updatedEpoch = new Date(workerChangeHistory.body.updated).getTime();
            expect(Math.abs(requestEpoch-updatedEpoch)).toBeLessThan(500);   // allows for slight clock slew

            validatePropertyChangeHistory(workerChangeHistory.body.nationality,
                                            secondNationality,
                                            randomNationality.id,
                                            establishment1Username,
                                            requestEpoch,
                                            (ref, given) => {
                                                return ref.value === 'Other' && ref.other.nationalityId == given
                                            });

            // update nationaltity by given value
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    nationality : {
                        value : "British"
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    nationality : {
                        value : "Don't know"
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);

            // update nationaltity by name
            const secondRandomNationality = nationalityUtils.lookupRandomNationality(nationalities);
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    nationality : {
                        value : "Other",
                        other : {
                            nationality : secondRandomNationality.nationality
                        }
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);
            fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.nationality.other.nationalityId).toEqual(secondRandomNationality.id);
            expect(fetchedWorkerResponse.body.nationality.other.nationality).toEqual(secondRandomNationality.nationality);

            // unknown given nationality
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    nationality : {
                        value : "Don't Know"          // case sensitive
                    }
                })
                .expect('Content-Type', /html/)
                .expect(400);
            // out of range nationality id
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    nationality : {
                        value : "Other",
                        other : {
                            nationalityId : 10000
                        }
                    }
                })
                .expect('Content-Type', /html/)
                .expect(400);
            // unknown nationality (by name)
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    nationality : {
                        value : "Other",
                        other : {
                            nationality : "wozietian"
                        }
                    }
                })
                .expect('Content-Type', /html/)
                .expect(400);
        });

        it("should update a Worker's country of birth", async () => {
            const randomCountry = countryUtils.lookupRandomCountry(countries);

            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    countryOfBirth : {
                        value : "Other",
                        other : {
                            countryId : randomCountry.id
                        }
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);
            let fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.countryOfBirth.other.countryId).toEqual(randomCountry.id);
            expect(fetchedWorkerResponse.body.countryOfBirth.other.country).toEqual(randomCountry.country);

            const secondCountry = randomCountry.id == 99 ? 100 : 99;
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    countryOfBirth : {
                        value : "Other",
                        other : {
                            countryId : secondCountry
                        }
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);

            // now test change history
            let requestEpoch = new Date().getTime();
            let workerChangeHistory =  await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}?history=full`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            let updatedEpoch = new Date(workerChangeHistory.body.updated).getTime();
            expect(Math.abs(requestEpoch-updatedEpoch)).toBeLessThan(500);   // allows for slight clock slew

            validatePropertyChangeHistory(workerChangeHistory.body.countryOfBirth,
                                            secondCountry,
                                            randomCountry.id,
                                            establishment1Username,
                                            requestEpoch,
                                            (ref, given) => {
                                                return ref.value === 'Other' && ref.other.countryId == given
                                            });

            // update country by given value
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    countryOfBirth : {
                        value : "United Kingdom"
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    countryOfBirth : {
                        value : "Don't know"
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);

            // update country of birth by name
            const secondRandomCountry = countryUtils.lookupRandomCountry(countries);
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    countryOfBirth : {
                        value : "Other",
                        other : {
                            country : secondRandomCountry.country
                        }
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);
            fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.countryOfBirth.other.countryId).toEqual(secondRandomCountry.id);
            expect(fetchedWorkerResponse.body.countryOfBirth.other.country).toEqual(secondRandomCountry.country);

            // unknown given country
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    countryOfBirth : {
                        value : "Don't Know"          // case sensitive
                    }
                })
                .expect('Content-Type', /html/)
                .expect(400);
            // out of range country id
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    countryOfBirth : {
                        value : "Other",
                        other : {
                            countryId : 10000
                        }
                    }
                })
                .expect('Content-Type', /html/)
                .expect(400);
            // unknown country (by name)
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    countryOfBirth : {
                        value : "Other",
                        other : {
                            country : "woziland"
                        }
                    }
                })
                .expect('Content-Type', /html/)
                .expect(400);
        });

        it("should update a Worker's recruited from", async () => {
            const randomOrigin = recruitedFromUtils.lookupRandomRecruitedFrom(recruitedOrigins);

            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    recruitedFrom : {
                        value : "Yes",
                        from : {
                            recruitedFromId : randomOrigin.id
                        }
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);
            let fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.recruitedFrom.from.recruitedFromId).toEqual(randomOrigin.id);
            expect(fetchedWorkerResponse.body.recruitedFrom.from.from).toEqual(randomOrigin.from);

            const secondOrigin = randomOrigin.id == 3 ? 7 : 3;
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    recruitedFrom : {
                        value : "Yes",
                        from : {
                            recruitedFromId : secondOrigin
                        }
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);

            // now test change history
            let requestEpoch = new Date().getTime();
            let workerChangeHistory =  await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}?history=full`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            let updatedEpoch = new Date(workerChangeHistory.body.updated).getTime();
            expect(Math.abs(requestEpoch-updatedEpoch)).toBeLessThan(500);   // allows for slight clock slew

            validatePropertyChangeHistory(workerChangeHistory.body.recruitedFrom,
                                            secondOrigin,
                                            randomOrigin.id,
                                            establishment1Username,
                                            requestEpoch,
                                            (ref, given) => {
                                                return ref.value === 'Yes' && ref.from.recruitedFromId == given
                                            });

            // update recruited from by given value
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    recruitedFrom : {
                        value : "No"
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);
            
             // update recruited from by name
            const secondRandomOrigin = recruitedFromUtils.lookupRandomRecruitedFrom(recruitedOrigins);
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    recruitedFrom : {
                        value : "Yes",
                        from : {
                            from : secondRandomOrigin.from
                        }
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);
            fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.recruitedFrom.from.recruitedFromId).toEqual(secondRandomOrigin.id);
            expect(fetchedWorkerResponse.body.recruitedFrom.from.from).toEqual(secondRandomOrigin.from);

            // unknown given recruited from
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    recruitedFrom : {
                        value : "yes"          // case sensitive
                    }
                })
                .expect('Content-Type', /html/)
                .expect(400);
            // out of range recruited from id
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    recruitedFrom : {
                        value : "Yes",
                        from : {
                            recruitedFromId : 100
                        }
                    }
                })
                .expect('Content-Type', /html/)
                .expect(400);
            // unknown recruited from (by name)
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    recruitedFrom : {
                        value : "Yes",
                        from : {
                            from : 'wozitech'
                        }
                    }
                })
                .expect('Content-Type', /html/)
                .expect(400);
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

            expect(fetchedWorkerResponse.body.updatedBy).toEqual(establishment1Username);

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

        it("should have creation and update change history", async () => {
            expect(establishment1).not.toBeNull();
            expect(Number.isInteger(establishmentId)).toEqual(true);

            const newWorker = workerUtils.newWorker(jobs);
            const newWorkerResponse = await apiEndpoint.post(`/establishment/${establishmentId}/worker`)
                .set('Authorization', establishment1Token)
                .send(newWorker)
                .expect('Content-Type', /json/)
                .expect(201);

            expect(newWorkerResponse.body.uid).not.toBeNull();
            const thisWorkerUid = newWorkerResponse.body.uid;


            // fetch with change history
            let fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${thisWorkerUid}?history=full`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);

            expect(fetchedWorkerResponse.body.uid).toEqual(thisWorkerUid);
            expect(fetchedWorkerResponse.body.created).not.toBeNull();

            const currentEpoch = new Date().getTime();
            const createdEpoch = new Date(fetchedWorkerResponse.body.created).getTime();
            expect(currentEpoch-createdEpoch).toBeLessThan(1000);   // within the last 1 second
            expect(fetchedWorkerResponse.body.updated).not.toBeNull();
            const updatedEpoch = new Date(fetchedWorkerResponse.body.updated).getTime();
            expect(currentEpoch-updatedEpoch).toBeLessThan(1000);   // within the last 1 second

            expect(fetchedWorkerResponse.body.updatedBy).toEqual(establishment1Username);

            expect(Array.isArray(fetchedWorkerResponse.body.history)).toEqual(true);
            expect(fetchedWorkerResponse.body.history.length).toEqual(1);
            expect(fetchedWorkerResponse.body.history[0].event).toEqual('created');

            // now update the Worker
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${thisWorkerUid}`)
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
            fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${thisWorkerUid}?history=full`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);

            expect(Array.isArray(fetchedWorkerResponse.body.history)).toEqual(true);
            expect(fetchedWorkerResponse.body.history.length).toEqual(2);
            expect(fetchedWorkerResponse.body.history[0].event).toEqual('updated');
            expect(fetchedWorkerResponse.body.history[1].event).toEqual('created');
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