const randomInt = (min, max) => {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
};

exports.lookupRandomService = (services) => {
    const randomCategoryIndex = randomInt(0, services.length-1);
    const randomServiceIndex = randomInt(0, services[randomCategoryIndex].services.length-1);
    return services[randomCategoryIndex].services[randomServiceIndex];
};