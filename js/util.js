/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */



importScript("../modevlib/aLibrary.js");
importScript("../modevlib/Settings.js");

importScript("../modevlib/MozillaPrograms.js");
importScript("../modevlib/qb/ESQuery.js");
importScript("../modevlib/charts/aChart.js");
importScript("../modevlib/charts/aColor.js");
importScript([
	"../css/menu.css"
]);
importScript("../modevlib/math/Stats.js");
importScript("../modevlib/qb/Qb.js");


var search = function*(query){

	var source = window.Settings.indexes[query.from];
	query.from=source.table;

	var output = yield (Rest.post({
		url: source.host+"/query",
		json: query
	}));

	Array.newInstance(output.edges).forall(function(e){
		e.domain.end=function(p){  // EXPECTING EDGES TO HAVE AN end() FUNCTION
			return p.value;
		};
	});

	yield (output);
};

Settings.host_types["ActiveData"]=search;
