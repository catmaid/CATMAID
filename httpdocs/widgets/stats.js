/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

var ProjectStatistics = new function()
{
  var update_stats_fields = function(data) {
    $("#proj_users").text(data.proj_users);
    $("#proj_neurons").text(data.proj_neurons);
    $("#proj_synapses").text(data.proj_synapses);
    $("#proj_treenodes").text(data.proj_treenodes);
    $("#proj_skeletons").text(data.proj_skeletons);
    $("#proj_presyn").text(data.proj_presyn);
    $("#proj_postsyn").text(data.proj_postsyn);
    $("#proj_textlabels").text(data.proj_textlabels);
    $("#proj_tags").text(data.proj_tags);
  }

  var update_piechart = function(data) {
    $("#piechart_treenode_holder").empty();
    var rpie = Raphael("piechart_treenode_holder");
    var pie = rpie.g.piechart(80, 100, 80, data.values, { legend: data.users, legendpos: "east"});
    pie.hover(function () {
      this.sector.stop();
      this.sector.scale(1.1, 1.1, this.cx, this.cy);
      if (this.label) {
        this.label[0].stop();
        this.label[0].scale(1.5);
        this.label[1].attr({"font-weight": 800});
      }
    }, function () {
      this.sector.animate({scale: [1, 1, this.cx, this.cy]}, 500, "bounce");
      if (this.label) {
        this.label[0].animate({scale: 1}, 500, "bounce");
        this.label[1].attr({"font-weight": 400});
      }
    });
  }

  var refresh_project_statistics = function() {
    requestQueue.register("model/stats.list.php", "POST", {
      "pid": project.getId()
    }, function (status, text, xml) {
      if (status == 200) {
        if (text && text != " ") {
          var jso = $.parseJSON(text);
          if (jso.error) {
            alert(jso.error);
          }
          else {
            update_stats_fields(jso);
          }
        }
      }
      return true;
    });

    requestQueue.register("model/stats.treenodes.list.php", "POST", {
      "pid": project.id
    }, function (status, text, xml) {
      if (status == 200) {
        if (text && text != " ") {
          var jso = $.parseJSON(text);
          if (jso.error) {
            alert(jso.error);
          }
          else {
            update_piechart(jso);
          }
        }
      }
      return true;
    });

  }

  this.init = function () {

    $("#refresh_stats").click(function () {
      refresh_project_statistics();
    });

    refresh_project_statistics();

  };
};
