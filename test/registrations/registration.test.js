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

describe ("Expected registrations", async () => {
    beforeAll(() => {
        // ideally, drop and recreate the database here,
        //  but introduce an endpoint, which is only
        //  available on localhost, which deletes all data
    });

    beforeEach(() => {
    });

    it("should create a non-CQC registation", async () => {
        const site = {
            "locationId": "1-1001921065",
            "locationName": "Warren Care non-CQC",
            "addressLine1": "Line 1",
            "addressLine2": "Line 2 Part 1, Line 2 Part 2",
            "townCity": "My Town",
            "county": "My County",
            "postalCode": "DY10 3RP",
            "mainService": "Nurses agency",
            "isRegulated": false,
            "user": {
                "fullname": "Warren Ayling",
                "jobTitle": "Backend Nurse",
                "emailAddress": "bob@bob.com",
                "contactNumber": "01111 111111",
                "username": "aylingwnoncqc",
                "password": "password",
                "securityQuestion": "What is dinner?",
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
        const cqcSite = {
            "locationId": "1-1001921065",
            "locationName": "Warren Care CQC",
            "addressLine1": "Line 1",
            "addressLine2": "Line 2 Part 1, Line 2 Part 2",
            "townCity": "My Town",
            "county": "My County",
            "postalCode": "DY10 3RP",
            "mainService": "Nurses agency",
            "isRegulated": true,
            "user": {
                "fullname": "Warren Ayling",
                "jobTitle": "Backend Nurse",
                "emailAddress": "bob@bob.com",
                "contactNumber": "01111 111111",
                "username": "aylingwcqc",
                "password": "password",
                "securityQuestion": "What is dinner?",
                "securityAnswer": "All Day"
            }
        };

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