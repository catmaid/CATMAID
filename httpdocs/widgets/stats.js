initProjectStats = function() {

	$("#refresh_stats").click(function () {
		refresh_project_statistics();
	});

	function refresh_project_statistics() {

		requestQueue.replace(
				"model/stats.list.php",
				"POST",
				{
				   "pid" : project.id,
				},
				function( status, text, xml )
				{
					if ( status == 200 )
					{
						if ( text && text != " " )
						{
							var jso = $.parseJSON(text);						
							if ( jso.error )
							{
								alert( jso.error );
							}
							else
							{
								update_stats_fields(jso);
							}
						}
					}
					return true;
				});
		
	}
	
	function update_stats_fields(data) {
		$("#proj_users").text(data.proj_users);
		$("#proj_neurons").text(data.proj_neurons);
		$("#proj_synapses").text(data.proj_synapses);
		$("#proj_treenodes").text(data.proj_treenodes);
		$("#proj_skeletons").text(data.proj_skeletons);
		$("#proj_presyn").text(data.proj_presyn);
		$("#proj_postsyn").text(data.proj_postsyn);
		$("#proj_textlabels").text(data.proj_textlabels);
	}
	
}




