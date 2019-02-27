
// this test script runs through a few various different actions on a specific workers (having first registered its own establishments)

// mock the general console loggers - removes unnecessary output while running
// global.console = {
//     log: jest.fn(),
//     warn: jest.fn(),
//     error: jest.fn()
// }

const supertest = require('supertest');
const uuid = require('uuid');
const baseEndpoint = require('../utils/baseUrl').baseurl;

let MIN_TIME_TOLERANCE = process.env.TEST_DEV ? 1000 : 400;
let MAX_TIME_TOLERANCE = process.env.TEST_DEV ? 3000 : 1000;

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
const jobUtils = require('../utils/jobs');

const PropertiesResponses = {};

const validatePropertyChangeHistory = (name, property, currentValue, previousValue, username, requestEpoch, compareFunction) => {
    /* eg.
    { currentValue: [ { jobId: 7, title: 'Assessment Officer' } ],
      lastSavedBy: 'Federico.Lebsack',
      lastChangedBy: 'Federico.Lebsack',
      lastSaved: '2019-01-31T07:57:09.645Z',
      lastChanged: '2019-01-31T07:57:09.645Z',
      changeHistory:
       [ { username: 'Federico.Lebsack',
           when: '2019-01-31T07:57:09.652Z',
           event: 'changed',
           change: [Object] },
         { username: 'Federico.Lebsack',
           when: '2019-01-31T07:57:09.652Z',
           event: 'saved' },
         { username: 'Federico.Lebsack',
           when: '2019-01-31T07:57:09.557Z',
           event: 'changed',
           change: [Object] },
         { username: 'Federico.Lebsack',
           when: '2019-01-31T07:57:09.557Z',
           event: 'saved' }
       ]
    }
    */
    expect(compareFunction(property.currentValue, currentValue)).toEqual(true);

    // console.log("TEST DEBUG: Last Save time difference: ", Math.abs(new Date(property.lastSaved).getTime() - requestEpoch));
    const lastChangedResponseTime = Math.abs(new Date(property.lastChanged).getTime() - requestEpoch);
    PropertiesResponses[name] = lastChangedResponseTime;

    expect(Math.abs(new Date(property.lastSaved).getTime() - requestEpoch)).toBeLessThan(MIN_TIME_TOLERANCE);
    expect(Math.abs(new Date(property.lastChanged).getTime() - requestEpoch)).toBeLessThan(MIN_TIME_TOLERANCE);
    expect(property.lastSavedBy).toEqual(username);
    expect(property.lastChangedBy).toEqual(username);

    const changeHistory = property.changeHistory;
    expect(Array.isArray(changeHistory)).toEqual(true);
    expect(changeHistory.length).toEqual(4);
    expect(changeHistory[0].username).toEqual(username);
    expect(changeHistory[1].username).toEqual(username);
    expect(changeHistory[2].username).toEqual(username);
    expect(changeHistory[3].username).toEqual(username);
    expect(Math.abs(new Date(changeHistory[0].when).getTime() - requestEpoch)).toBeLessThan(MIN_TIME_TOLERANCE);
    expect(Math.abs(new Date(changeHistory[1].when).getTime() - requestEpoch)).toBeLessThan(MIN_TIME_TOLERANCE);
    expect(Math.abs(new Date(changeHistory[2].when).getTime() - requestEpoch)).toBeLessThan(MAX_TIME_TOLERANCE);
    expect(Math.abs(new Date(changeHistory[3].when).getTime() - requestEpoch)).toBeLessThan(MAX_TIME_TOLERANCE);
    expect(changeHistory[0].event).toEqual('changed');
    expect(changeHistory[1].event).toEqual('saved');
    expect(changeHistory[2].event).toEqual('changed');
    expect(changeHistory[3].event).toEqual('saved');

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
    let timeDifference = null;

    describe("Establishment 1 against " + baseEndpoint, async () => {
        let establishmentId = null;
        let workerUid = null;

        beforeAll(async () => {
            // clean the database
            if (process.env.CLEAN_DB) {
                await apiEndpoint.post('/test/clean')
                    .send({})
                    .expect(200);
            }

            console.log("Testing against: ", baseEndpoint);

            // offset local time and server time
            const serverTimeResponse = await apiEndpoint.get('/test/timestamp');
            if (serverTimeResponse.headers['x-timestamp']) {
                const serverTime = parseInt(serverTimeResponse.headers['x-timestamp']);
                const localTime = new Date().getTime();
                timeDifference = localTime - serverTime;
                // console.log("TEST DEBUG: local time: ", localTime);
                // console.log("TEST DEBUG: remote time: ", serverTime);
                // console.log("TEST DEBUG: time difference: ", timeDifference);
            }                


            // setup reference test data - two establishments
            const nonCqcServicesResults = await apiEndpoint.get('/services/byCategory?cqc=false')
                .expect('Content-Type', /json/)
                .expect(200);
            
            nonCqcServices = nonCqcServicesResults.body;
            const site1 =  registrationUtils.newNonCqcSite(postcodes[2], nonCqcServices);
            const site1Response = await apiEndpoint.post('/registration')
                .send([site1])
                .expect('Content-Type', /json/)
                .expect(200);
            establishment1 = site1Response.body;
            establishmentId = establishment1.establishmentId;


            // need to login to get JWT token
            let site1LoginResponse = null;
            site1LoginResponse = await apiEndpoint.post('/login')
                .send({
                    username: site1.user.username,
                    password: site1.user.password
                });

            // the worker test is sometimes failing with authentication issue
            if (site1LoginResponse.body && site1LoginResponse.body.fullname) {
                establishment1Token = site1LoginResponse.header.authorization;
                establishment1Username = site1.user.username;
            } else {
                console.log("TEST DEBUG: login response: ", site1LoginResponse.body);

                // login a second time
                site1LoginResponse = await apiEndpoint.post('/login')
                    .send({
                        username: site1.user.username,
                        password: site1.user.password
                    });
                establishment1Token = site1LoginResponse.header.authorization;
                establishment1Username = site1.user.username;
            }
        });

        let newWorker = null;
        it("should create a Worker", async () => {
            expect(establishment1).not.toBeNull();
            expect(Number.isInteger(establishmentId)).toEqual(true);

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
        
            // create the Worker having tested all failures first; minimises the response time being create and update (next)
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
            expect(Math.abs(requestEpoch-updatedEpoch)).toBeLessThan(MIN_TIME_TOLERANCE);   // allows for slight clock slew

            validatePropertyChangeHistory('NameOrId',
                                          workerChangeHistory.body.nameOrId,
                                          updatedNameId,
                                          newWorker.nameOrId,
                                          establishment1Username,
                                          requestEpoch,
                                          (ref, given) => {
                                            return ref == given
                                          });
            validatePropertyChangeHistory('contract',
                workerChangeHistory.body.contract,
                updatedContract,
                newWorker.contract,
                establishment1Username,
                requestEpoch,
                (ref, given) => {
                  return ref == given
                });
            validatePropertyChangeHistory('mainJob',
                workerChangeHistory.body.mainJob,
                updatedJobId,
                newWorker.mainJob.jobId,
                establishment1Username,
                requestEpoch,
                (ref, given) => {
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
            expect(Math.abs(requestEpoch-updatedEpoch)).toBeLessThan(MIN_TIME_TOLERANCE);   // allows for slight clock slew

            validatePropertyChangeHistory(
                'approvedMentalHealthWorker',
                workerChangeHistory.body.approvedMentalHealthWorker,
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
            expect(Math.abs(requestEpoch-updatedEpoch)).toBeLessThan(MIN_TIME_TOLERANCE);   // allows for slight clock slew

            validatePropertyChangeHistory(
                'mainJobStartDate',
                workerChangeHistory.body.mainJobStartDate,
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
            expect(Math.abs(requestEpoch-updatedEpoch)).toBeLessThan(MIN_TIME_TOLERANCE);   // allows for slight clock slew

            validatePropertyChangeHistory('nationalInsuranceNumber',
                workerChangeHistory.body.nationalInsuranceNumber,
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
            expect(Math.abs(requestEpoch-updatedEpoch)).toBeLessThan(MIN_TIME_TOLERANCE);   // allows for slight clock slew

            validatePropertyChangeHistory(
                'dateOfBirth',
                workerChangeHistory.body.dateOfBirth,
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
            expect(Math.abs(requestEpoch-updatedEpoch)).toBeLessThan(MIN_TIME_TOLERANCE);   // allows for slight clock slew

            validatePropertyChangeHistory(
                'postcode',
                workerChangeHistory.body.postcode,
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
            expect(Math.abs(requestEpoch-updatedEpoch)).toBeLessThan(MIN_TIME_TOLERANCE);   // allows for slight clock slew

            validatePropertyChangeHistory(
                'gender',
                workerChangeHistory.body.gender,
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
            expect(Math.abs(requestEpoch-updatedEpoch)).toBeLessThan(MIN_TIME_TOLERANCE);   // allows for slight clock slew

            validatePropertyChangeHistory(
                'disability',
                workerChangeHistory.body.disability,
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
            expect(Math.abs(requestEpoch-updatedEpoch)).toBeLessThan(MIN_TIME_TOLERANCE);   // allows for slight clock slew

            validatePropertyChangeHistory(
                'ethnicity',
                workerChangeHistory.body.ethnicity,
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
            expect(Math.abs(requestEpoch-updatedEpoch)).toBeLessThan(MIN_TIME_TOLERANCE);   // allows for slight clock slew

            validatePropertyChangeHistory(
                'nationality',
                workerChangeHistory.body.nationality,
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
            expect(Math.abs(requestEpoch-updatedEpoch)).toBeLessThan(MIN_TIME_TOLERANCE);   // allows for slight clock slew

            validatePropertyChangeHistory(
                'countryOfBirth',
                workerChangeHistory.body.countryOfBirth,
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
            expect(Math.abs(requestEpoch-updatedEpoch)).toBeLessThan(MIN_TIME_TOLERANCE);   // allows for slight clock slew

            validatePropertyChangeHistory(
                'recruitedFrom',
                workerChangeHistory.body.recruitedFrom,
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

        it("should update a Worker's British Citizenship", async () => {
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    britishCitizenship : "Yes"
                })
                .expect('Content-Type', /json/)
                .expect(200);
            let fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.britishCitizenship).toEqual('Yes');

            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    britishCitizenship : "No"
                })
                .expect('Content-Type', /json/)
                .expect(200);
            fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.britishCitizenship).toEqual('No');

            // now test change history
            let requestEpoch = new Date().getTime();
            let workerChangeHistory =  await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}?history=full`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            let updatedEpoch = new Date(workerChangeHistory.body.updated).getTime();
            expect(Math.abs(requestEpoch-updatedEpoch)).toBeLessThan(MIN_TIME_TOLERANCE);   // allows for slight clock slew

            validatePropertyChangeHistory('britishCitizenship',
                workerChangeHistory.body.britishCitizenship,
                'No',
                'Yes',
                establishment1Username,
                requestEpoch,
                (ref, given) => {
                    return ref == given
                });

            // last update with expected value
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    britishCitizenship : "Don't know"
                })
                .expect('Content-Type', /json/)
                .expect(200);
            fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.britishCitizenship).toEqual("Don't know");
            
            // unknown citizenship value
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    britishCitizenship : "Don't Know"       // case sensitive
                })
                .expect('Content-Type', /html/)
                .expect(400);
        });

        it("should update a Worker's Year of Arrival", async () => {
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    yearArrived: {
                        value: "Yes",
                        year: 2019              // upper boundary - this year (yes, I could have used a date to calculate, but you'll need to update the tests in one years time - good time to review tests)
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);
            let fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.yearArrived.value).toEqual('Yes');
            expect(fetchedWorkerResponse.body.yearArrived.year).toEqual(2019);

            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    yearArrived: {
                        value: "Yes",
                        year: 1919              // lower boundary - this year (yes, I could have used a date to calculate, but you'll need to update the tests in one years time - good time to review tests)
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);
            fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.yearArrived.value).toEqual('Yes');
            expect(fetchedWorkerResponse.body.yearArrived.year).toEqual(1919);

            // now test change history
            let requestEpoch = new Date().getTime();
            let workerChangeHistory =  await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}?history=full`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            let updatedEpoch = new Date(workerChangeHistory.body.updated).getTime();
            expect(Math.abs(requestEpoch-updatedEpoch)).toBeLessThan(MIN_TIME_TOLERANCE);   // allows for slight clock slew

            validatePropertyChangeHistory(
                'yearArrived',
                workerChangeHistory.body.yearArrived,
                1919,
                2019,
                establishment1Username,
                requestEpoch,
                (ref, given) => {
                    return ref.value = 'Yes' && ref.year == given
                });

            // last update with expected value
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    yearArrived: {
                        value: "No"
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);
            fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.yearArrived.value).toEqual('No');
            
            // unknown given value
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    yearArrived: {
                        value: "no"         // case sensitive
                    }
                })
                .expect('Content-Type', /html/)
                .expect(400);

            // upper and lower year boundaries
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    yearArrived: {
                        value: "Yes",
                        year: 1918              // lower boundary - this year (yes, I could have used a date to calculate, but you'll need to update the tests in one years time - good time to review tests)
                    }
                })
                .expect('Content-Type', /html/)
                .expect(400);
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    yearArrived: {
                        value: "Yes",
                        year: 2020              // upper boundary - this year (yes, I could have used a date to calculate, but you'll need to update the tests in one years time - good time to review tests)
                    }
                })
                .expect('Content-Type', /html/)
                .expect(400);
        });

        it("should update a Worker's Social Care Start Date", async () => {
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    socialCareStartDate: {
                        value: "Yes",
                        year: 2019              // upper boundary - this year (yes, I could have used a date to calculate, but you'll need to update the tests in one years time - good time to review tests)
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);
            let fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.socialCareStartDate.value).toEqual('Yes');
            expect(fetchedWorkerResponse.body.socialCareStartDate.year).toEqual(2019);

            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    socialCareStartDate: {
                        value: "Yes",
                        year: 1919              // lower boundary - this year (yes, I could have used a date to calculate, but you'll need to update the tests in one years time - good time to review tests)
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);
            fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
                expect(fetchedWorkerResponse.body.socialCareStartDate.value).toEqual('Yes');
                expect(fetchedWorkerResponse.body.socialCareStartDate.year).toEqual(1919);

            // now test change history
            let requestEpoch = new Date().getTime();
            let workerChangeHistory =  await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}?history=full`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            let updatedEpoch = new Date(workerChangeHistory.body.updated).getTime();
            expect(Math.abs(requestEpoch-updatedEpoch)).toBeLessThan(MIN_TIME_TOLERANCE);   // allows for slight clock slew

            validatePropertyChangeHistory(
                'socialCareStartDate',
                workerChangeHistory.body.socialCareStartDate,
                1919,
                2019,
                establishment1Username,
                requestEpoch,
                (ref, given) => {
                    return ref.value = 'Yes' && ref.year == given
                });

            // last update with expected value
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    socialCareStartDate: {
                        value: "No"
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);
            fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.socialCareStartDate.value).toEqual('No');
            
            // unknown given value
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    socialCareStartDate: {
                        value: "no"         // case sensitive
                    }
                })
                .expect('Content-Type', /html/)
                .expect(400);

            // upper and lower year boundaries
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    socialCareStartDate: {
                        value: "Yes",
                        year: 1918              // lower boundary - this year (yes, I could have used a date to calculate, but you'll need to update the tests in one years time - good time to review tests)
                    }
                })
                .expect('Content-Type', /html/)
                .expect(400);
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    socialCareStartDate: {
                        value: "Yes",
                        year: 2020              // upper boundary - this year (yes, I could have used a date to calculate, but you'll need to update the tests in one years time - good time to review tests)
                    }
                })
                .expect('Content-Type', /html/)
                .expect(400);
        });

        it("should update a Worker's Other Jobs", async () => {
            const firstRandomJob = jobUtils.lookupRandomJob(jobs);
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    otherJobs : [
                        {
                            jobId: firstRandomJob.id
                        }
                    ]
                })
                .expect('Content-Type', /json/)
                .expect(200);
            let fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            
            expect(Array.isArray(fetchedWorkerResponse.body.otherJobs)).toEqual(true);
            expect(fetchedWorkerResponse.body.otherJobs.length).toEqual(1);
            expect(fetchedWorkerResponse.body.otherJobs[0].jobId).toEqual(firstRandomJob.id);
            expect(fetchedWorkerResponse.body.otherJobs[0].title).toEqual(firstRandomJob.title);

            // replace the contents - with another single count set
            const secondRandomJobId = firstRandomJob.id == 7 ? 8 : 7;
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    otherJobs : [
                        {
                            jobId: secondRandomJobId
                        }
                    ]
                })
                .expect('Content-Type', /json/)
                .expect(200);
            fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(Array.isArray(fetchedWorkerResponse.body.otherJobs)).toEqual(true);
            expect(fetchedWorkerResponse.body.otherJobs.length).toEqual(1);
            expect(fetchedWorkerResponse.body.otherJobs[0].jobId).toEqual(secondRandomJobId);

            // now test change history
            let requestEpoch = new Date().getTime();
            let workerChangeHistory =  await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}?history=full`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            let updatedEpoch = new Date(workerChangeHistory.body.updated).getTime();
            expect(Math.abs(requestEpoch-updatedEpoch)).toBeLessThan(MIN_TIME_TOLERANCE);   // allows for slight clock slew

            validatePropertyChangeHistory(
                'otherJobs',
                workerChangeHistory.body.otherJobs,
                secondRandomJobId,
                firstRandomJob.id,
                establishment1Username,
                requestEpoch,
                (ref, given) => {
                    if (ref.hasOwnProperty('value')) {
                        return ref.otherJobs[0].jobId == given
                    } else {
                        return ref[0].jobId == given
                    }
                });

            // with two additional jobs
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    otherJobs : [
                        {
                            jobId: 1
                        },
                        {
                            jobId: 2
                        }
                    ]
                })
                .expect('Content-Type', /json/)
                .expect(200);
            fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
                expect(fetchedWorkerResponse.body.otherJobs.length).toEqual(2);
            // with three additional jobs
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    otherJobs : [
                        {
                            jobId: 1
                        },
                        {
                            jobId: 2
                        },
                        {
                            jobId: 3
                        }
                    ]
                })
                .expect('Content-Type', /json/)
                .expect(200);
            fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.otherJobs.length).toEqual(3);
            // with zero jobs
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    otherJobs : []
                })
                .expect('Content-Type', /json/)
                .expect(200);
            fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.otherJobs.length).toEqual(0);


            // now resolving on job title
            const thirdRandomJob = jobUtils.lookupRandomJob(jobs);
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    otherJobs : [
                        {
                            title: thirdRandomJob.title
                        }
                    ]
                })
                .expect('Content-Type', /json/)
                .expect(200);
            fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(Array.isArray(fetchedWorkerResponse.body.otherJobs)).toEqual(true);
            expect(fetchedWorkerResponse.body.otherJobs.length).toEqual(1);
            expect(fetchedWorkerResponse.body.otherJobs[0].jobId).toEqual(thirdRandomJob.id);
            expect(fetchedWorkerResponse.body.otherJobs[0].title).toEqual(thirdRandomJob.title);
            
            // out of range job id
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    otherJobs : [
                        {
                            jobId: 100
                        }
                    ]
                })
                .expect('Content-Type', /html/)
                .expect(400);
            
            // unknown job title
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    otherJobs : [
                        {
                            title: "This job does not exist"
                        }
                    ]
                })
                .expect('Content-Type', /html/)
                .expect(400);

            // other jobs is not an array
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    otherJobs : {
                        title: "This job does not exist"
                    }
                })
                .expect('Content-Type', /html/)
                .expect(400);

            // missing job id
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    otherJobs : [
                        {
                            id: thirdRandomJob.id
                        }
                    ]
                })
                .expect('Content-Type', /html/)
                .expect(400);
        
            
            // missing job title
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    otherJobs : [
                        {
                            job: thirdRandomJob.title
                        }
                    ]
                })
                .expect('Content-Type', /html/)
                .expect(400);
        });

        it("should update a Worker's Sick Days", async () => {
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    daysSick : {
                        value : "Yes",
                        days : 1.7
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);
            let fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            
            expect(fetchedWorkerResponse.body.daysSick.value).toEqual('Yes');
            expect(fetchedWorkerResponse.body.daysSick.days).toEqual(1.5);  // rounds to nearest 0.5

            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    daysSick : {
                        value : "Yes",
                        days : 12.2
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);
            fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.daysSick.value).toEqual('Yes');
            expect(fetchedWorkerResponse.body.daysSick.days).toEqual(12.0);  // rounds to nearest 0.5

            // now test change history
            let requestEpoch = new Date().getTime();
            let workerChangeHistory =  await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}?history=full`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            let updatedEpoch = new Date(workerChangeHistory.body.updated).getTime();
            expect(Math.abs(requestEpoch-updatedEpoch)).toBeLessThan(MIN_TIME_TOLERANCE);   // allows for slight clock slew

            validatePropertyChangeHistory(
                'daysSick',
                workerChangeHistory.body.daysSick,
                12.0,
                1.5,
                establishment1Username,
                requestEpoch,
                (ref, given) => {
                    return ref.value = 'Yes' && ref.days == given
                });

            // days sick with expected value
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    daysSick: {
                        value: "No"
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);
            fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.daysSick.value).toEqual('No');
            
            // unknown given value
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    daysSick: {
                        value: "no"         // case sensitive
                    }
                })
                .expect('Content-Type', /html/)
                .expect(400);

            // upper and lower day boundaries
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    daysSick : {
                        value : "Yes",
                        days : 0
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    daysSick : {
                        value : "Yes",
                        days : -0.5
                    }
                })
                .expect('Content-Type', /html/)
                .expect(400);
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    daysSick : {
                        value : "Yes",
                        days : 366
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    daysSick : {
                        value : "Yes",
                        days : 366.1        // rounds to nearest 0.5, but test is for any greater than 366.0
                    }
                })
                .expect('Content-Type', /html/)
                .expect(400);

            // invalid input structure
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    daysSick : {
                        sick : "Yes"
                    }
                })
                .expect('Content-Type', /html/)
                .expect(400);
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    daysSick : {
                        value : "Yes",
                        rate: 3
                    }
                })
                .expect('Content-Type', /html/)
                .expect(400);
        });

        it("should update a Worker's zero hours contract", async () => {
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    zeroHoursContract : "No"
                })
                .expect('Content-Type', /json/)
                .expect(200);
            let fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            
            expect(fetchedWorkerResponse.body.zeroHoursContract).toEqual('No');

            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    zeroHoursContract : "Yes"
                })
                .expect('Content-Type', /json/)
                .expect(200);
            fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.zeroHoursContract).toEqual('Yes');

            // now test change history
            let requestEpoch = new Date().getTime();
            let workerChangeHistory =  await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}?history=full`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            let updatedEpoch = new Date(workerChangeHistory.body.updated).getTime();
            expect(Math.abs(requestEpoch-updatedEpoch)).toBeLessThan(MIN_TIME_TOLERANCE);   // allows for slight clock slew

            validatePropertyChangeHistory(
                'zeroHoursContract',
                workerChangeHistory.body.zeroHoursContract,
                'Yes',
                'No',
                establishment1Username,
                requestEpoch,
                (ref, given) => {
                    return ref == given
                });

            // zero contract with expected value
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    zeroHoursContract : "Don't know"
                })
                .expect('Content-Type', /json/)
                .expect(200);
            fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
                expect(fetchedWorkerResponse.body.zeroHoursContract).toEqual("Don't know");
            
            // unexpected given value
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    zeroHoursContract : "Don't Know"        // case sensitive
                })
                .expect('Content-Type', /html/)
                .expect(400);
        });

        it("should update a Worker's Weekly Average Hours", async () => {
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    weeklyHoursAverage : {
                        value : "Yes",
                        hours : 37.5
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);
            let fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.weeklyHoursAverage.value).toEqual('Yes');
            expect(fetchedWorkerResponse.body.weeklyHoursAverage.hours).toEqual(37.5);

            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    weeklyHoursAverage : {
                        value : "No"
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);
            fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.weeklyHoursAverage.value).toEqual('No');
            expect(fetchedWorkerResponse.body.weeklyHoursAverage.hours).toEqual(undefined);
    
            // now test change history
            let requestEpoch = new Date().getTime();
            let workerChangeHistory =  await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}?history=full`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            let updatedEpoch = new Date(workerChangeHistory.body.updated).getTime();
            expect(Math.abs(requestEpoch-updatedEpoch)).toBeLessThan(MIN_TIME_TOLERANCE);   // allows for slight clock slew

            validatePropertyChangeHistory(
                'weeklyHoursAverage',
                workerChangeHistory.body.weeklyHoursAverage,
                'No',
                'Yes',
                establishment1Username,
                requestEpoch,
                (ref, given) => {
                    return ref.value == given
                });

            // round the the nearest 0.5
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    weeklyHoursAverage : {
                        value : "Yes",
                        hours: 37.3
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);
            fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.weeklyHoursAverage.value).toEqual('Yes');
            expect(fetchedWorkerResponse.body.weeklyHoursAverage.hours).toEqual(37.5);

            // upper and lower boundary values
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    weeklyHoursAverage : {
                        value : "Yes",
                        hours: 65                   // upper boundary
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    weeklyHoursAverage : {
                        value : "Yes",
                        hours: 65.1
                    }
                })
                .expect('Content-Type', /html/)
                .expect(400);
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    weeklyHoursAverage : {
                        value : "Yes",
                        hours: 0                    // lower boundary
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    weeklyHoursAverage : {
                        value : "Yes",
                        hours: -0.1
                    }
                })
                .expect('Content-Type', /html/)
                .expect(400);
            
            // unexpected value and structure
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    weeklyHoursAverage : {
                        value: "yes",           // case sensitive
                        hours: 37.5
                    }
                })
                .expect('Content-Type', /html/)
                .expect(400);
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    weeklyHoursAverage : {
                        test: "No"
                    }
                })
                .expect('Content-Type', /html/)
                .expect(400);
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    weeklyHoursAverage : {
                        value: "Yes",
                        given: 37.5
                    }
                })
                .expect('Content-Type', /html/)
                .expect(400);
        });

        it("should update a Worker's Weekly Contracted Hours", async () => {
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    weeklyHoursContracted : {
                        value : "Yes",
                        hours : 37.5
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);
            let fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.weeklyHoursContracted.value).toEqual('Yes');
            expect(fetchedWorkerResponse.body.weeklyHoursContracted.hours).toEqual(37.5);

            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    weeklyHoursContracted : {
                        value : "No"
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);
            fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.weeklyHoursContracted.value).toEqual('No');
            expect(fetchedWorkerResponse.body.weeklyHoursContracted.hours).toEqual(undefined);
    
            // now test change history
            let requestEpoch = new Date().getTime();
            let workerChangeHistory =  await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}?history=full`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            let updatedEpoch = new Date(workerChangeHistory.body.updated).getTime();
            expect(Math.abs(requestEpoch-updatedEpoch)).toBeLessThan(MIN_TIME_TOLERANCE);   // allows for slight clock slew

            validatePropertyChangeHistory(
                'weeklyHoursContracted',
                workerChangeHistory.body.weeklyHoursContracted,
                'No',
                'Yes',
                establishment1Username,
                requestEpoch,
                (ref, given) => {
                    return ref.value == given
                });

            // round the the nearest 0.5
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    weeklyHoursContracted : {
                        value : "Yes",
                        hours: 37.3
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);
            fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.weeklyHoursContracted.value).toEqual('Yes');
            expect(fetchedWorkerResponse.body.weeklyHoursContracted.hours).toEqual(37.5);

            // upper and lower boundary values
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    weeklyHoursContracted : {
                        value : "Yes",
                        hours: 65                   // upper boundary
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    weeklyHoursContracted : {
                        value : "Yes",
                        hours: 65.1
                    }
                })
                .expect('Content-Type', /html/)
                .expect(400);
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    weeklyHoursContracted : {
                        value : "Yes",
                        hours: 0                    // lower boundary
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    weeklyHoursContracted : {
                        value : "Yes",
                        hours: -0.1
                    }
                })
                .expect('Content-Type', /html/)
                .expect(400);
            
            // unexpected value and structure
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    weeklyHoursContracted : {
                        value: "yes",           // case sensitive
                        hours: 37.5
                    }
                })
                .expect('Content-Type', /html/)
                .expect(400);
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    weeklyHoursContracted : {
                        test: "No"
                    }
                })
                .expect('Content-Type', /html/)
                .expect(400);
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    weeklyHoursContracted : {
                        value: "Yes",
                        given: 37.5
                    }
                })
                .expect('Content-Type', /html/)
                .expect(400);
        });

        it("should update a Worker's Annual/Hourly Rate", async () => {
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    annualHourlyPay : {
                        value : "Hourly",
                        rate : 50.00
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);
            let fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.annualHourlyPay.value).toEqual('Hourly');
            expect(fetchedWorkerResponse.body.annualHourlyPay.rate).toEqual(50.00);

            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    annualHourlyPay : {
                        value : "Annually",
                        rate : 25677
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);
            fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
                expect(fetchedWorkerResponse.body.annualHourlyPay.value).toEqual('Annually');
                expect(fetchedWorkerResponse.body.annualHourlyPay.rate).toEqual(25677);
    
            // now test change history
            let requestEpoch = new Date().getTime();
            let workerChangeHistory =  await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}?history=full`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            let updatedEpoch = new Date(workerChangeHistory.body.updated).getTime();
            expect(Math.abs(requestEpoch-updatedEpoch)).toBeLessThan(MIN_TIME_TOLERANCE);   // allows for slight clock slew

            // test change history for both the rate and the value
            validatePropertyChangeHistory(
                'annualHourlyPay',
                workerChangeHistory.body.annualHourlyPay,
                25677,
                50.00,
                establishment1Username,
                requestEpoch,
                (ref, given) => {
                    return ref.rate == given
                });
            validatePropertyChangeHistory(
                'annualHourlyPay',
                workerChangeHistory.body.annualHourlyPay,
                'Annually',
                'Hourly',
                establishment1Username,
                requestEpoch,
                (ref, given) => {
                    return ref.value == given
                });
    
            // round the the nearest 0.01 (for hourly)
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    annualHourlyPay : {
                        value : "Hourly",
                        rate : 11.147
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);
            fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.annualHourlyPay.rate).toEqual(11.15);

            // round the the nearest whole number (for annual)
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    annualHourlyPay : {
                        value : "Annually",
                        rate : 28576.57
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);
            fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.annualHourlyPay.rate).toEqual(28577);
        
            // expected and unexpected values
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    annualHourlyPay : {
                        value : "Don't know"
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);
            fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.annualHourlyPay.value).toEqual("Don't know");
            expect(fetchedWorkerResponse.body.annualHourlyPay.rate).toEqual(undefined);
            
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    annualHourlyPay : {
                            value : "Don't Know"      // case sensitive
                    }
                })
                .expect('Content-Type', /html/)
                .expect(400);
            
            // upper and lower boundary values for hourly rate
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    annualHourlyPay : {
                        value : "Hourly",
                        rate : 200                  // upper boundary
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    annualHourlyPay : {
                        value : "Hourly",
                        rate : 200.01                // upper boundary
                    }
                })
                .expect('Content-Type', /html/)
                .expect(400);
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    annualHourlyPay : {
                        value : "Hourly",
                        rate : 2.50                  // lower boundary
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    annualHourlyPay : {
                        value : "Hourly",
                        rate : 2.49                  // lower boundary
                    }
                })
                .expect('Content-Type', /html/)
                .expect(400);
            
            // upper and lower boundary values for annual rate
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    annualHourlyPay : {
                        value : "Annually",
                        rate : 200000                  // upper boundary
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    annualHourlyPay : {
                        value : "Annually",
                        rate : 200001                  // upper boundary
                    }
                })
                .expect('Content-Type', /html/)
                .expect(400);
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    annualHourlyPay : {
                        value : "Annually",
                        rate : 500                  // lower boundary
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    annualHourlyPay : {
                        value : "Annually",
                        rate : 499                  // lower boundary
                    }
                })
                .expect('Content-Type', /html/)
                .expect(400);
            
            // unexpected value and structure
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    annualHourlyPay : {
                        Value : "Annually",         // case sensitive attributes
                        rate : 10000
                    }
                })
                .expect('Content-Type', /html/)
                .expect(400);
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    annualHourlyPay : {
                        value : "Annually",
                        Rate : 10000                // case sensitive attributes
                    }
                })
                .expect('Content-Type', /html/)
                .expect(400);
        });

        it("should update a Worker's Care Certificate", async () => {
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    careCertificate : "Yes, in progress or partially completed"
                })
                .expect('Content-Type', /json/)
                .expect(200);
            let fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            
            expect(fetchedWorkerResponse.body.careCertificate).toEqual('Yes, in progress or partially completed');

            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    careCertificate : "Yes, completed"
                })
                .expect('Content-Type', /json/)
                .expect(200);
            fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.careCertificate).toEqual('Yes, completed');

            // now test change history
            let requestEpoch = new Date().getTime();
            let workerChangeHistory =  await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}?history=full`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            let updatedEpoch = new Date(workerChangeHistory.body.updated).getTime();
            expect(Math.abs(requestEpoch-updatedEpoch)).toBeLessThan(MIN_TIME_TOLERANCE);   // allows for slight clock slew

            validatePropertyChangeHistory(
                'careCertificate',
                workerChangeHistory.body.careCertificate,
                'Yes, completed',
                'Yes, in progress or partially completed',
                establishment1Username,
                requestEpoch,
                (ref, given) => {
                    return ref == given
                });

            // zero contract with expected value
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    careCertificate : "No"
                })
                .expect('Content-Type', /json/)
                .expect(200);
            fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
                expect(fetchedWorkerResponse.body.careCertificate).toEqual("No");
            
            // unexpected given value
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    careCertificate : "no"        // case sensitive
                })
                .expect('Content-Type', /html/)
                .expect(400);
        });

        it("should update a Worker's Apprenticeship Training", async () => {
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    apprenticeshipTraining : "Don't know"
                })
                .expect('Content-Type', /json/)
                .expect(200);
            let fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.apprenticeshipTraining).toEqual('Don\'t know');

            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    apprenticeshipTraining : "Yes"
                })
                .expect('Content-Type', /json/)
                .expect(200);
            fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.apprenticeshipTraining).toEqual('Yes');

            // now test change history
            let requestEpoch = new Date().getTime();
            let workerChangeHistory =  await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}?history=full`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            let updatedEpoch = new Date(workerChangeHistory.body.updated).getTime();
            expect(Math.abs(requestEpoch-updatedEpoch)).toBeLessThan(MIN_TIME_TOLERANCE);   // allows for slight clock slew

            validatePropertyChangeHistory(
                'apprenticeshipTraining',
                workerChangeHistory.body.apprenticeshipTraining,
                'Yes',
                'Don\'t know',
                establishment1Username,
                requestEpoch,
                (ref, given) => {
                    return ref == given
                });

            // zero contract with expected value
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    apprenticeshipTraining : "No"
                })
                .expect('Content-Type', /json/)
                .expect(200);
            fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
                expect(fetchedWorkerResponse.body.apprenticeshipTraining).toEqual("No");
            
            // unexpected given value
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    apprenticeshipTraining : "Don't Know"        // case sensitive
                })
                .expect('Content-Type', /html/)
                .expect(400);
        });


        it("should update a Worker's Qualification In Social Care", async () => {
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    qualificationInSocialCare : "Don't know"
                })
                .expect('Content-Type', /json/)
                .expect(200);
            let fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.qualificationInSocialCare).toEqual('Don\'t know');

            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    qualificationInSocialCare : "Yes"
                })
                .expect('Content-Type', /json/)
                .expect(200);
            fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.qualificationInSocialCare).toEqual('Yes');

            // now test change history
            let requestEpoch = new Date().getTime();
            let workerChangeHistory =  await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}?history=full`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            let updatedEpoch = new Date(workerChangeHistory.body.updated).getTime();
            expect(Math.abs(requestEpoch-updatedEpoch)).toBeLessThan(MIN_TIME_TOLERANCE);   // allows for slight clock slew

            validatePropertyChangeHistory(
                'qualificationInSocialCare',
                workerChangeHistory.body.qualificationInSocialCare,
                'Yes',
                'Don\'t know',
                establishment1Username,
                requestEpoch,
                (ref, given) => {
                    return ref == given
                });

            // zero contract with expected value
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    qualificationInSocialCare : "No"
                })
                .expect('Content-Type', /json/)
                .expect(200);
            fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
                expect(fetchedWorkerResponse.body.qualificationInSocialCare).toEqual("No");
            
            // unexpected given value
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    qualificationInSocialCare : "Don't Know"        // case sensitive
                })
                .expect('Content-Type', /html/)
                .expect(400);
        });

        it("should update a Worker's Social Care qualifications", async () => {
            const randomQualification = qualificationUtils.lookupRandomQualification(qualifications);

            const updateWWorkerResponse = await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    socialCareQualification : {
                        qualificationId : randomQualification.id
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);
            let fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            
            expect(fetchedWorkerResponse.body.socialCareQualification.qualificationId).toEqual(randomQualification.id);
            expect(fetchedWorkerResponse.body.socialCareQualification.title).toEqual(randomQualification.level);

            const secondQualification = randomQualification.id == 2 ? 3 : 2;
            const updateWorkerResponse2 = await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    socialCareQualification : {
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
            expect(Math.abs(requestEpoch-updatedEpoch)).toBeLessThan(MIN_TIME_TOLERANCE);   // allows for slight clock slew

            validatePropertyChangeHistory(
                'socialCareQualification',
                workerChangeHistory.body.socialCareQualification,
                secondQualification,
                randomQualification.id,
                establishment1Username,
                requestEpoch,
                (ref, given) => {
                    return ref.qualificationId == given
                });

            // update qualification by name
            const secondRandomQualification = qualificationUtils.lookupRandomQualification(qualifications);
            const updateQualificationByNameResponse = await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    socialCareQualification : {
                        title: secondRandomQualification.level
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);
            fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.socialCareQualification.qualificationId).toEqual(secondRandomQualification.id);
            expect(fetchedWorkerResponse.body.socialCareQualification.title).toEqual(secondRandomQualification.level);

            // out of range qualification id
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    socialCareQualification : {
                        qualificationId: 100
                    }
                })
                .expect('Content-Type', /html/)
                .expect(400);
            // unknown qualification (by name)
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    socialCareQualification : {
                        title: "UnKnown"
                    }
                })
                .expect('Content-Type', /html/)
                .expect(400);
        });

        it("should update a Worker's Other Qualification", async () => {
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    otherQualification : "Don't know"
                })
                .expect('Content-Type', /json/)
                .expect(200);
            let fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.otherQualification).toEqual('Don\'t know');

            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    otherQualification : "Yes"
                })
                .expect('Content-Type', /json/)
                .expect(200);
            fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.otherQualification).toEqual('Yes');

            // now test change history
            let requestEpoch = new Date().getTime();
            let workerChangeHistory =  await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}?history=full`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            let updatedEpoch = new Date(workerChangeHistory.body.updated).getTime();
            expect(Math.abs(requestEpoch-updatedEpoch)).toBeLessThan(MIN_TIME_TOLERANCE);   // allows for slight clock slew

            validatePropertyChangeHistory(
                'otherQualification',
                workerChangeHistory.body.otherQualification,
                'Yes',
                'Don\'t know',
                establishment1Username,
                requestEpoch,
                (ref, given) => {
                    return ref == given
                });

            // zero contract with expected value
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    otherQualification : "No"
                })
                .expect('Content-Type', /json/)
                .expect(200);
            fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
                expect(fetchedWorkerResponse.body.otherQualification).toEqual("No");
            
            // unexpected given value
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    otherQualification : "Don't Know"        // case sensitive
                })
                .expect('Content-Type', /html/)
                .expect(400);
        });

        it("should update a Worker's Highest (other) qualifications", async () => {
            const randomQualification = qualificationUtils.lookupRandomQualification(qualifications);

            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    highestQualification : {
                        qualificationId : randomQualification.id
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);
            let fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.highestQualification.qualificationId).toEqual(randomQualification.id);
            expect(fetchedWorkerResponse.body.highestQualification.title).toEqual(randomQualification.level);

            const secondQualification = randomQualification.id == 2 ? 3 : 2;
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    highestQualification : {
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
            expect(Math.abs(requestEpoch-updatedEpoch)).toBeLessThan(MIN_TIME_TOLERANCE);   // allows for slight clock slew

            validatePropertyChangeHistory(
                'highestQualification',
                workerChangeHistory.body.highestQualification,
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
                    highestQualification : {
                        title: secondRandomQualification.level
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);
            fetchedWorkerResponse = await apiEndpoint.get(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(fetchedWorkerResponse.body.highestQualification.qualificationId).toEqual(secondRandomQualification.id);
            expect(fetchedWorkerResponse.body.highestQualification.title).toEqual(secondRandomQualification.level);

            // out of range qualification id
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    highestQualification : {
                        qualificationId: 100
                    }
                })
                .expect('Content-Type', /html/)
                .expect(400);
            // unknown qualification (by name)
            await apiEndpoint.put(`/establishment/${establishmentId}/worker/${workerUid}`)
                .set('Authorization', establishment1Token)
                .send({
                    highestQualification : {
                        title: "UnKnown"
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
            expect(currentEpoch-createdEpoch).toBeLessThan(MAX_TIME_TOLERANCE);   // within the last 1 second
            expect(fetchedWorkerResponse.body.updated).not.toBeNull();
            const updatedEpoch = new Date(fetchedWorkerResponse.body.updated).getTime();
            expect(currentEpoch-updatedEpoch).toBeLessThan(MAX_TIME_TOLERANCE);   // within the last 1 second

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
            expect(currentEpoch-createdEpoch).toBeLessThan(MAX_TIME_TOLERANCE);   // within the last 1 second
            expect(fetchedWorkerResponse.body.updated).not.toBeNull();
            const updatedEpoch = new Date(fetchedWorkerResponse.body.updated).getTime();
            expect(currentEpoch-updatedEpoch).toBeLessThan(MAX_TIME_TOLERANCE);   // within the last 1 second

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

        it("Should report on response times", () => {
            const properties = Object.keys(PropertiesResponses);
            let consoleOutput = '';
            properties.forEach(thisProperty => {
                consoleOutput += `\x1b[0m\x1b[33m${thisProperty.padEnd(35, '.')}\x1b[37m\x1b[2m${PropertiesResponses[thisProperty]} ms\n`;
            });
            console.log(consoleOutput);
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