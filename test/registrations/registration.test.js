// this test script runs through a few various different registrations
//  including the catching of duplicate registrations

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

const randomInt = (min, max) => {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
};

const lookupRandomService = (services) => {
    const randomCategoryIndex = randomInt(0, services.length-1);
    const randomServiceIndex = randomInt(0, services[randomCategoryIndex].services.length-1);
    return services[randomCategoryIndex].services[randomServiceIndex];
};

describe ("Expected registrations", async () => {
    let cqcServices = null;
    let nonCqcServices = null;
    beforeAll(async () => {
        // clean the database
        await apiEndpoint.post('/test/clean')
            .send({})
            .expect(200);

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
        //console.log("WA TEST - non cqc services: ", nonCqcServices);
        // no location id for non-CQC site
        const site = {
            "locationName": faker.lorem.words(4),
            "addressLine1": postcodes[0].address1,
            "addressLine2": faker.lorem.words(2),
            "townCity": postcodes[0].townAndCity,
            "county": postcodes[0].county,
            "postalCode": postcodes[0].postcode,
            "mainService": lookupRandomService(nonCqcServices).name,
            "isRegulated": false,
            "user": {
                "fullname": faker.name.findName(),
                "jobTitle": "Integration Tester",
                "emailAddress": faker.internet.email(),
                "contactNumber": faker.phone.phoneNumber('01#########'),
                "username": faker.internet.userName(),
                "password": "password",
                "securityQuestion": "When is dinner?",
                "securityAnswer": "All Day"
            }
        };

        apiEndpoint.post('/registration')
            .send([site])
            .expect('Content-Type', /json/)
            .expect(200)
            .end((err, res) => {
                if (err) {
                    console.error(err);
                }
                console.log(res.body);
        });

    });
    it("should create a CQC registation", async () => {
        // console.log("WA TEST -CQC services: ", cqcServices);
        const cqcSite = {
            "locationId": locations[0].locationId,
            "locationName": faker.lorem.words(4) + " CQC",
            "addressLine1": locations[0].address1,
            "addressLine2": locations[0].address2,
            "townCity": locations[0].townAndCity,
            "county": locations[0].county,
            "postalCode": locations[0].postcode,
            "mainService": lookupRandomService(nonCqcServices).name,    // locations[0].mainServiceName - the main service name as defined in locations does not match our services
            "isRegulated": true,
            "user": {
                "fullname": faker.name.findName(),
                "jobTitle": "Integration Tester",
                "emailAddress": faker.internet.email(),
                "contactNumber": faker.phone.phoneNumber('01#########'),
                "username": faker.internet.userName(),
                "password": "password",
                "securityQuestion": "What is for dinner?",
                "securityAnswer": "Beef Stew"
            }
        };

        console.log("WA DEBUG: cqc site: ", cqcSite)

        apiEndpoint.post('/registration')
            .send([cqcSite])
            .expect('Content-Type', /json/)
            .expect(200)
            .end((err, res) => {
                if (err) {
                    console.error(err);
                }
                console.log(res.body);
        });
    });

});