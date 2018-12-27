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
const locations = require('../mockdata/locations').data;
const postcodes = require('../mockdata/postcodes').data;

const Random = require('../utils/random');

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

        it("should update the number of staff", async () => {
            expect(authToken).not.toBeNull();
            expect(establishmentId).not.toBeNull();

            const firstResponse = await apiEndpoint.get(`/establishment/${establishmentId}/staff`)
                .set('Authorization', authToken)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(firstResponse.body.id).toEqual(establishmentId);
            expect(firstResponse.body.name).toEqual(site.locationName);
            expect(firstResponse.body.numberOfStaff).toBeNull();


            const newNumberOfStaff = Random.randomInt(10,999);
            let updateResponse = await apiEndpoint.post(`/establishment/${establishmentId}/staff/${newNumberOfStaff}`)
                .set('Authorization', authToken)
                .send({})
                .expect('Content-Type', /json/)
                .expect(200);
            expect(updateResponse.body.id).toEqual(establishmentId);
            expect(updateResponse.body.name).toEqual(site.locationName);
            expect(updateResponse.body.numberOfStaff).toEqual(newNumberOfStaff);

            const secondResponse = await apiEndpoint.get(`/establishment/${establishmentId}/staff`)
                .set('Authorization', authToken)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(secondResponse.body.id).toEqual(establishmentId);
            expect(secondResponse.body.name).toEqual(site.locationName);
            expect(secondResponse.body.numberOfStaff).toEqual(newNumberOfStaff);

            // now test for an out of range number of staff
            apiEndpoint.post(`/establishment/${establishmentId}/staff/1000`)
                .set('Authorization', authToken)
                .send({
                    employerType : "Unknown"
                })
                .expect('Content-Type', /text/)
                .expect(400)
                .end((err,res) => {
                    expect(res.text).toEqual('Unexpected  number of staff: 1000');
                    expect(res.error.status).toEqual(400);
                });
        });

        it("should update 'other' services", async () => {
            expect(authToken).not.toBeNull();
            expect(establishmentId).not.toBeNull();

            const firstResponse = await apiEndpoint.get(`/establishment/${establishmentId}/services?all=true`)
                .set('Authorization', authToken)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(firstResponse.body.id).toEqual(establishmentId);
            expect(firstResponse.body.name).toEqual(site.locationName);
            expect(Number.isInteger(firstResponse.body.mainService.id)).toEqual(true);
            expect(firstResponse.body.mainService.name).toEqual(site.mainService);

            // before adding any services
            expect(Array.isArray(firstResponse.body.otherServices)).toEqual(true);
            expect(firstResponse.body.otherServices.length).toEqual(0);

            // we also called the get with all=true, so test 'allOtherServices'
            expect(Array.isArray(firstResponse.body.allOtherServices)).toEqual(true);
            

            // because the `other services` filters out the main service, the results are dependent on main service - so can't use a snapshot!
            // TODO - spend more time on validating the other services response here. For now, just assume there are one or more
            expect(firstResponse.body.allOtherServices.length).toBeGreaterThanOrEqual(1);

            // add new other services (not equal to the main service)
            const expectedNumberOfOtherServices = Random.randomInt(1,3);
            const nonCqcServicesResults = await apiEndpoint.get('/services/byCategory?cqc=false')
                .expect('Content-Type', /json/)
                .expect(200);
            const nonCqcServiceIDs = [];
            nonCqcServicesResults.body.forEach(thisServiceCategory => {
                thisServiceCategory.services.forEach(thisService => {
                    // ignore the main service ID and service ID of 9/10 (these have two capacity questions and will always be used for a non-CQC establishment)
                    if ((thisService.id !== firstResponse.body.mainService.id) && (thisService.id !== 9) && (thisService.id !== 10)) {
                        nonCqcServiceIDs.push(thisService.id);
                    }
                })
            });
            expect(nonCqcServiceIDs.length).toBeGreaterThan(0);

            // always use service ID of 9 or 10 (whichever is not the main service id)
            //   we also add a known CQC service to prove it is ignored (always the first!
            const newNonCQCServiceIDs = [
                {
                    id: 29
                },
                {
                    id: firstResponse.body.mainService.id === 9 ? 10 : 9
                }
            ];
            for (let loopCount=0; loopCount < expectedNumberOfOtherServices; loopCount++) {
                // random can return the same index more than once; which will cause irratic failures on test
                let nextServiceId = null;
                while (nextServiceId === null) {
                    const testServiceId = nonCqcServiceIDs[Math.floor(Math.random() * nonCqcServiceIDs.length)];
                    if (!newNonCQCServiceIDs.find(existingService => existingService.id === testServiceId)) nextServiceId = testServiceId;
                } 

                newNonCQCServiceIDs.push({
                    id: nextServiceId
                });
            }
            expect(nonCqcServiceIDs.length).toBeGreaterThan(0);

            let updateResponse = await apiEndpoint.post(`/establishment/${establishmentId}/services`)
                .set('Authorization', authToken)
                .send({
                    services: newNonCQCServiceIDs
                })
                .expect('Content-Type', /json/)
                .expect(200);
            expect(updateResponse.body.id).toEqual(establishmentId);
            expect(updateResponse.body.name).toEqual(site.locationName);
            expect(Number.isInteger(updateResponse.body.mainService.id)).toEqual(true);
            expect(updateResponse.body.mainService.name).toEqual(site.mainService);
            expect(Array.isArray(updateResponse.body.allOtherServices)).toEqual(true);
            expect(updateResponse.body.allOtherServices.length).toEqual(0);

            // confirm the services
            expect(Array.isArray(updateResponse.body.otherServices)).toEqual(true);
            expect(updateResponse.body.otherServices.length).toBeGreaterThan(0);

            // remove the dodgy CQC service from the input set and return id as integer not object
            const reworkedReferenceServiceIDs = newNonCQCServiceIDs.filter(x => x.id!=29).map(y => y.id);
            // console.log("WA TEST: original and reworked service IDs: ", newNonCQCServiceIDs, reworkedReferenceServiceIDs);

            // now compare the returned other services with those expected
            const returnedOtherServicesID = [];
            updateResponse.body.otherServices.forEach(thisServiceCategory => {
                thisServiceCategory.services.forEach(thisService => {
                    returnedOtherServicesID.push(thisService.id);
                })
            });
            const referenceEqualsReturned = reworkedReferenceServiceIDs.length === returnedOtherServicesID.length &&
                                            reworkedReferenceServiceIDs.sort().every((value, index) => { return value === returnedOtherServicesID.sort()[index]});
            expect(referenceEqualsReturned).toEqual(true);

            // now test the get having updated 'other service'
            const secondResponse = await apiEndpoint.get(`/establishment/${establishmentId}/services`)
                .set('Authorization', authToken)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(secondResponse.body.id).toEqual(establishmentId);
            expect(secondResponse.body.name).toEqual(site.locationName);
            const fetchedOtherServicesID = [];
            secondResponse.body.otherServices.forEach(thisServiceCategory => {
                thisServiceCategory.services.forEach(thisService => {
                    fetchedOtherServicesID.push(thisService.id);
                })
            });
            // console.log("WA TEST: original and fetched service IDs: ", fetchedOtherServicesID, reworkedReferenceServiceIDs);
            const fetchedEqualsReturned = reworkedReferenceServiceIDs.length === fetchedOtherServicesID.length &&
                                            reworkedReferenceServiceIDs.sort().every((value, index) => { return value === fetchedOtherServicesID.sort()[index]});
            expect(fetchedEqualsReturned).toEqual(true);
        });

        it("should update the number of vacancies, starters and leavers", async () => {
            expect(authToken).not.toBeNull();
            expect(establishmentId).not.toBeNull();

            let jobsResponse = await apiEndpoint.get(`/establishment/${establishmentId}/jobs`)
                .set('Authorization', authToken)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(jobsResponse.body.id).toEqual(establishmentId);
            expect(jobsResponse.body.name).toEqual(site.locationName);
            expect(jobsResponse.body.jobs.TotalVacencies).toEqual(0);
            expect(jobsResponse.body.jobs.TotalStarters).toEqual(0);
            expect(jobsResponse.body.jobs.TotalLeavers).toEqual(0);

            jobsResponse = await apiEndpoint.post(`/establishment/${establishmentId}/jobs`)
                .set('Authorization', authToken)
                .send({
                    jobs: {
                        vacancies: [
                            {
                                "jobId" : 1,
                                "total" : 999
                            },
                            {
                                "jobId" : 2,
                                "total" : 1000,
                            },
                            {
                                "jobId" : 10,
                                "total" : 333
                            },
                            {
                                "jobId" : "18",
                                "total" : 22
                            }
                        ]
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);
            expect(jobsResponse.body.id).toEqual(establishmentId);
            expect(jobsResponse.body.name).toEqual(site.locationName);
            expect(jobsResponse.body.jobs.TotalVacencies).toEqual(1332);
            expect(jobsResponse.body.jobs.TotalStarters).toEqual(0);
            expect(jobsResponse.body.jobs.TotalLeavers).toEqual(0);

            jobsResponse = await apiEndpoint.post(`/establishment/${establishmentId}/jobs`)
                .set('Authorization', authToken)
                .send({
                    jobs: {
                        starters: [
                            {
                                "jobId" : 17,
                                "total" : 43
                            },
                            {
                                "id" : 1,
                                "total" : 4
                            },
                            {
                                "jobId" : 2,
                                "total" : 1000,
                            },
                            {
                                "jobId" : 11,
                                "total" : 756
                            }
                        ]
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);
            expect(jobsResponse.body.id).toEqual(establishmentId);
            expect(jobsResponse.body.name).toEqual(site.locationName);
            expect(jobsResponse.body.jobs.TotalVacencies).toEqual(1332);
            expect(jobsResponse.body.jobs.TotalStarters).toEqual(799);
            expect(jobsResponse.body.jobs.TotalLeavers).toEqual(0);

            
            jobsResponse = await apiEndpoint.post(`/establishment/${establishmentId}/jobs`)
                .set('Authorization', authToken)
                .send({
                    jobs: {
                        vacancies: [],
                        leavers: [
                            {
                                "jobId" : 12,
                                "total" : 1000,
                            },
                            {
                                "jobId" : 9,
                                "total" : 111
                            },
                            {
                                "jobId" : 14,
                                "total" : 11
                            }
                        ]
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);
            expect(jobsResponse.body.id).toEqual(establishmentId);
            expect(jobsResponse.body.name).toEqual(site.locationName);
            expect(jobsResponse.body.jobs.TotalVacencies).toEqual(0);
            expect(jobsResponse.body.jobs.TotalStarters).toEqual(799);
            expect(jobsResponse.body.jobs.TotalLeavers).toEqual(122);


            jobsResponse = await apiEndpoint.post(`/establishment/${establishmentId}/jobs`)
                .set('Authorization', authToken)
                .send({
                    jobs: {
                        leavers: []
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);
            expect(jobsResponse.body.id).toEqual(establishmentId);
            expect(jobsResponse.body.name).toEqual(site.locationName);
            expect(jobsResponse.body.jobs.TotalVacencies).toEqual(0);
            expect(jobsResponse.body.jobs.TotalStarters).toEqual(799);
            expect(jobsResponse.body.jobs.TotalLeavers).toEqual(0);
        });

        it("should update the sharing options", async () => {
            expect(authToken).not.toBeNull();
            expect(establishmentId).not.toBeNull();

            const firstResponse = await apiEndpoint.get(`/establishment/${establishmentId}/share`)
                .set('Authorization', authToken)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(firstResponse.body.id).toEqual(establishmentId);
            expect(firstResponse.body.name).toEqual(site.locationName);
            expect(firstResponse.body.share.enabled).toEqual(false);        // disabled (default) on registration

            // enable sharing (no options)
            let updateResponse = await apiEndpoint.post(`/establishment/${establishmentId}/share`)
                .set('Authorization', authToken)
                .send({
                    "share" : {
                        "enabled" : true
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);
            expect(updateResponse.body.id).toEqual(establishmentId);
            expect(updateResponse.body.name).toEqual(site.locationName);
            expect(updateResponse.body.share.enabled).toEqual(true);
            expect(Array.isArray(updateResponse.body.share.with)).toEqual(true);
            expect(updateResponse.body.share.with.length).toEqual(0);

            updateResponse = await apiEndpoint.get(`/establishment/${establishmentId}/share`)
                .set('Authorization', authToken)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(updateResponse.body.id).toEqual(establishmentId);
            expect(updateResponse.body.name).toEqual(site.locationName);
            expect(updateResponse.body.share.enabled).toEqual(true);
            expect(Array.isArray(updateResponse.body.share.with)).toEqual(true);
            expect(updateResponse.body.share.with.length).toEqual(0);
    
            // with sharing enabled, add options, some of which are happily ignored
            updateResponse = await apiEndpoint.post(`/establishment/${establishmentId}/share`)
                .set('Authorization', authToken)
                .send({
                    "share" : {
                        "enabled" : true,
                        "with" : ["withAdmin", "Local Authority", "withPet"]
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);
            expect(updateResponse.body.id).toEqual(establishmentId);
            expect(updateResponse.body.name).toEqual(site.locationName);
            expect(updateResponse.body.share.enabled).toEqual(true);
            expect(Array.isArray(updateResponse.body.share.with)).toEqual(true);
            expect(updateResponse.body.share.with.length).toEqual(1);
            expect(updateResponse.body.share.with[0]).toEqual('Local Authority');

            updateResponse = await apiEndpoint.get(`/establishment/${establishmentId}/share`)
                .set('Authorization', authToken)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(updateResponse.body.id).toEqual(establishmentId);
            expect(updateResponse.body.name).toEqual(site.locationName);
            expect(updateResponse.body.share.enabled).toEqual(true);
            expect(Array.isArray(updateResponse.body.share.with)).toEqual(true);
            expect(updateResponse.body.share.with.length).toEqual(1);
            expect(updateResponse.body.share.with[0]).toEqual('Local Authority');

            // now disable sharing - provide with options, but they will be ignored
            updateResponse = await apiEndpoint.post(`/establishment/${establishmentId}/share`)
                .set('Authorization', authToken)
                .send({
                    "share" : {
                        "enabled" : false,
                        "with" : ["CQC"]
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);
            expect(updateResponse.body.id).toEqual(establishmentId);
            expect(updateResponse.body.name).toEqual(site.locationName);
            expect(updateResponse.body.share.enabled).toEqual(false);

            updateResponse = await apiEndpoint.get(`/establishment/${establishmentId}/share`)
                .set('Authorization', authToken)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(updateResponse.body.id).toEqual(establishmentId);
            expect(updateResponse.body.name).toEqual(site.locationName);
            expect(updateResponse.body.share.enabled).toEqual(false);

            // now re-enable sharing (no options), they should be as they were before being disabled
            updateResponse = await apiEndpoint.post(`/establishment/${establishmentId}/share`)
                .set('Authorization', authToken)
                .send({
                    "share" : {
                        "enabled" : true
                    }
                })
                .expect('Content-Type', /json/)
                .expect(200);
            expect(updateResponse.body.id).toEqual(establishmentId);
            expect(updateResponse.body.name).toEqual(site.locationName);
            expect(updateResponse.body.share.enabled).toEqual(true);
            expect(Array.isArray(updateResponse.body.share.with)).toEqual(true);
            expect(updateResponse.body.share.with.length).toEqual(1);
            expect(updateResponse.body.share.with[0]).toEqual('Local Authority');

            updateResponse = await apiEndpoint.get(`/establishment/${establishmentId}/share`)
                .set('Authorization', authToken)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(updateResponse.body.id).toEqual(establishmentId);
            expect(updateResponse.body.name).toEqual(site.locationName);
            expect(updateResponse.body.share.enabled).toEqual(true);
            expect(Array.isArray(updateResponse.body.share.with)).toEqual(true);
            expect(updateResponse.body.share.with.length).toEqual(1);
            expect(updateResponse.body.share.with[0]).toEqual('Local Authority');

        });

        it("should get the Establishment", async () => {
            expect(authToken).not.toBeNull();
            expect(establishmentId).not.toBeNull();

            const firstResponse = await apiEndpoint.get(`/establishment/${establishmentId}`)
                .set('Authorization', authToken)
                .expect('Content-Type', /json/)
                .expect(200);
            expect(firstResponse.body.id).toEqual(establishmentId);
            expect(firstResponse.body.name).toEqual(site.locationName);
            expect(firstResponse.body.postcode).toEqual(site.postalCode);
            expect(firstResponse.body.numberOfStaff).not.toBeNull();
            expect(firstResponse.body.numberOfStaff).toBeGreaterThan(0);
            expect(Number.isInteger(firstResponse.body.mainService.id)).toEqual(true);
            expect(firstResponse.body.mainService.name).toEqual(site.mainService);
            expect(firstResponse.body.share.enabled).toEqual(true);
            expect(firstResponse.body.share.with[0]).toEqual('Local Authority');
            expect(firstResponse.body.jobs.TotalVacencies).toEqual(0);
            expect(firstResponse.body.jobs.TotalStarters).toEqual(799);
            expect(firstResponse.body.jobs.TotalLeavers).toEqual(0);
            expect(Array.isArray(firstResponse.body.otherServices)).toEqual(true);
            expect(firstResponse.body.otherServices.length).toBeGreaterThan(0);

            // TODO: add assertions for service capacities and local authority share
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

        // include only tests that differ to those of a non-CQC establishment; namely "other services" and "share" (because wanting to share with CQC)
    });

});